import { supabase } from './supabase';

/* =============================================================================
   O ARQUIVO do documento (PDF ou foto do papel)
   -----------------------------------------------------------------------------
   Este arquivo é deliberadamente o OPOSTO de fotos.js em três pontos, e cada um
   tem um motivo:

   1. O CAMINHO É ALEATÓRIO. A foto vive em 'colaboradores/<id>.jpg', previsível
      de propósito — é um avatar. Aqui o caminho não pode ser derivado de nada:
      quem descobrisse o padrão poderia tentar adivinhar o RG de alguém. O
      caminho real existe só na linha da tabela, que é admin-only.

   2. A URL ASSINADA NÃO ENTRA EM CACHE, e vale 60 segundos. Uma URL assinada é
      uma chave ao portador: quem tem o link abre o arquivo, logado ou não.
      Guardar isso em memória por uma hora, como se faz com avatar, seria
      espalhar chave de RG e ASO pela sessão inteira. Aqui ela é feita no
      clique, usada, e morre.

   3. TODO ACESSO É REGISTRADO. Abrir, enviar e apagar deixam rastro em
      documentos_acessos, que não tem policy de update nem de delete — nem o
      admin reescreve o próprio histórico.
   ============================================================================= */

export const BUCKET = 'documentos';

/* 60s: tempo de o navegador abrir o PDF, e não mais que isso. */
const VALIDADE_URL = 60;

const EXTENSOES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/* Espelha o bucket criado no 07: se a checagem estivesse só no banco, o
   usuário descobriria o limite depois de esperar o upload de um arquivo
   grande falhar. */
export const TAMANHO_MAX = 15 * 1024 * 1024;

export function validarArquivo(arquivo) {
  if (!arquivo) return 'Nenhum arquivo escolhido.';
  if (!EXTENSOES[arquivo.type]) return 'Use PDF, JPG, PNG ou WEBP.';
  if (arquivo.size > TAMANHO_MAX) {
    return `Arquivo de ${(arquivo.size / 1048576).toFixed(1)} MB — o limite é 15 MB.`;
  }
  return '';
}

// Exportado porque ferias.js (mesmo esquema de caminho, bucket diferente)
// reaproveita em vez de duplicar a lógica de nome aleatório.
export function caminhoAleatorio(arquivo) {
  const ext = EXTENSOES[arquivo.type] || 'bin';
  const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return `${id}.${ext}`;
}

/** Rastro de acesso. Nunca derruba a ação principal: um log que falha não pode
    impedir alguém de abrir o documento de que precisa agora. */
export async function registrarAcesso({ documentoId, colaboradorId, acao, quem }) {
  const { error } = await supabase.from('documentos_acessos').insert([{
    documento_id: documentoId || null,
    colaborador_id: colaboradorId || null,
    acao,
    quem: quem || null,   // a policy exige quem = auth.uid()
  }]);
  if (error) console.error('Auditoria:', error.message);
}

/**
 * Sobe o arquivo e prende ele à linha do documento.
 * `existente` é a linha já registrada na conferência (pode ter validade e
 * nenhum arquivo); se não houver, cria uma.
 * Devolve a linha salva.
 */
export async function enviarArquivo({
  arquivo, colaborador, tipo, existente, validoAte, quem,
}) {
  const erro = validarArquivo(arquivo);
  if (erro) throw new Error(erro);

  const caminho = caminhoAleatorio(arquivo);
  const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type,
    upsert: false,             // caminho é único; colisão é erro de verdade
  });
  if (up.error) throw up.error;

  const campos = {
    nome_arquivo: arquivo.name,
    caminho,
    mime: arquivo.type,
    tamanho_bytes: arquivo.size,
  };

  let res;
  if (existente) {
    res = await supabase.from('documentos')
      .update(campos).eq('id', existente.id).select();
  } else {
    res = await supabase.from('documentos').insert([{
      colaboradorId: colaborador.id,
      tipo_id: tipo.id,
      categoria: tipo.categoria,
      titulo: tipo.nome,
      valido_ate: validoAte || null,
      repetivel: false,
      enviado_por: quem || null,
      ...campos,
    }]).select();
  }

  // Se o banco recusar depois do upload, o arquivo ficaria órfão no bucket,
  // ocupando espaço e sem ninguém para apagá-lo. Desfaz.
  if (res.error || !res.data?.length) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw res.error || new Error('Não consegui salvar o registro do arquivo.');
  }

  const linha = res.data[0];
  registrarAcesso({
    documentoId: linha.id, colaboradorId: colaborador.id, acao: 'enviou', quem,
  });
  return linha;
}

/**
 * Abre o arquivo numa aba nova. A URL é criada no clique e expira em 60s —
 * ver a explicação no topo. Se o arquivo sumiu do bucket, avisa em vez de
 * abrir uma aba em branco.
 */
export async function abrirArquivo(doc, quem) {
  if (!doc?.caminho) throw new Error('Este documento ainda não tem arquivo anexado.');

  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrl(doc.caminho, VALIDADE_URL);
  if (error || !data?.signedUrl) {
    throw error || new Error('Não consegui gerar o link do arquivo.');
  }

  registrarAcesso({
    documentoId: doc.id, colaboradorId: doc.colaboradorId, acao: 'abriu', quem,
  });
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Tira o arquivo mas MANTÉM o registro e a validade.
 * Apagar a linha inteira faria o documento voltar a constar como "nunca
 * entregue" — o alarme de prazo pararia junto, que é justamente o que não pode
 * acontecer só porque alguém trocou um PDF errado.
 */
export async function removerArquivo(doc, quem) {
  if (!doc?.caminho) return doc;

  const res = await supabase.from('documentos').update({
    caminho: null, nome_arquivo: null, mime: null, tamanho_bytes: null,
  }).eq('id', doc.id).select();
  if (res.error || !res.data?.length) {
    throw res.error || new Error('Não consegui desanexar o arquivo.');
  }

  // Só apaga do bucket depois que a linha soltou a referência: na ordem
  // inversa, uma falha aqui deixaria a tabela apontando para um arquivo que
  // não existe mais.
  await supabase.storage.from(BUCKET).remove([doc.caminho]);
  registrarAcesso({
    documentoId: doc.id, colaboradorId: doc.colaboradorId, acao: 'apagou', quem,
  });
  return res.data[0];
}

/* =============================================================================
   ATESTADO — um documento 'repetivel', com período em vez de validade
   -----------------------------------------------------------------------------
   Os outros tipos são um por pessoa (RG, ASO): enviarArquivo acima decide entre
   inserir e atualizar olhando 'existente'. Atestado é o oposto — cada
   afastamento é um registro novo, então salvarAtestado sempre insere, a menos
   que quem chamou passe 'existente' de propósito, para corrigir um período já
   lançado (mesmo uuid, novo emitido_em/valido_ate).

   O arquivo aqui é OPCIONAL: "Subir o documento ou/e o intervalo de tempo" —
   o período sozinho já é suficiente para o gatilho do banco gerar a falta.
   ============================================================================= */
export async function salvarAtestado({
  colaborador, tipoAtestado, emitidoEm, validoAte, observacao, arquivo, existente, quem,
}) {
  if (!emitidoEm || !validoAte) throw new Error('Informe o início e o fim do período.');
  if (validoAte < emitidoEm) throw new Error('O fim não pode vir antes do início.');

  let caminho = null;
  let arquivoCampos = {};
  if (arquivo) {
    const erro = validarArquivo(arquivo);
    if (erro) throw new Error(erro);
    caminho = caminhoAleatorio(arquivo);
    const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    });
    if (up.error) throw up.error;
    arquivoCampos = {
      nome_arquivo: arquivo.name, caminho, mime: arquivo.type, tamanho_bytes: arquivo.size,
    };
  }

  const payload = {
    colaboradorId: colaborador.id,
    tipo_id: tipoAtestado.id,
    categoria: tipoAtestado.categoria,
    titulo: tipoAtestado.nome,
    emitido_em: emitidoEm,
    valido_ate: validoAte,
    observacao: observacao || null,
    repetivel: true,
    ...arquivoCampos,
  };
  if (!existente) payload.enviado_por = quem || null;

  const res = existente
    ? await supabase.from('documentos').update(payload).eq('id', existente.id).select()
    : await supabase.from('documentos').insert([payload]).select();

  // Mesmo cuidado do enviarArquivo: se o banco recusar depois do upload, o
  // arquivo não pode ficar órfão no bucket.
  if (res.error || !res.data?.length) {
    if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
    throw res.error || new Error('Não consegui salvar o atestado.');
  }

  const linha = res.data[0];
  registrarAcesso({
    documentoId: linha.id, colaboradorId: colaborador.id, acao: 'enviou', quem,
  });
  return linha;
}
