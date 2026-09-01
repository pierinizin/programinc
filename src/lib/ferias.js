import { supabase } from './supabase';
import { validarArquivo, caminhoAleatorio } from './arquivosDoc';

/* =============================================================================
   FÉRIAS
   -----------------------------------------------------------------------------
   Ao contrário de atestado, férias não é dado de saúde e não bloqueia
   ninguém — é só o período + um aviso visual (anel amarelo) em quem já está
   numa equipe. Por isso vive em tabela própria ('ferias'), visível a quem já
   lê falta hoje (pode_ler — todos os cargos autenticados).

   O anexo é opcional (aviso de férias, recibo) e, esse sim, só admin abre —
   pode carregar dado pessoal mesmo não sendo de saúde. Mesmo esquema de
   caminho aleatório de arquivosDoc.js, bucket próprio ('ferias'), sem log de
   auditoria: 13-atestados-ferias.sql não criou uma 'ferias_acessos' porque
   este anexo não tem a mesma exigência de rastro do atestado.
   ============================================================================= */

export const BUCKET = 'ferias';

const VALIDADE_URL = 60;

/**
 * Salva o período (cria ou edita, se 'existente' vier preenchido) e, se um
 * arquivo foi escolhido, sobe ele para o bucket privado. O período é o que
 * importa — se o upload falhar depois de já ter subido o arquivo, desfaz o
 * upload e recusa o salvamento inteiro, para nunca deixar um arquivo órfão
 * no bucket.
 */
export async function salvarFerias({
  colaborador, dataInicio, dataFim, observacao, arquivo, existente,
}) {
  if (!dataInicio || !dataFim) throw new Error('Informe o início e o fim do período.');
  if (dataFim < dataInicio) throw new Error('O fim não pode vir antes do início.');

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
    data_inicio: dataInicio,
    data_fim: dataFim,
    observacao: observacao || null,
    ...arquivoCampos,
  };

  const res = existente
    ? await supabase.from('ferias').update(payload).eq('id', existente.id).select()
    : await supabase.from('ferias').insert([payload]).select();

  if (res.error || !res.data?.length) {
    if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
    throw res.error || new Error('Não consegui salvar as férias.');
  }

  // Trocou o arquivo de um período que já tinha um: o antigo fica órfão no
  // bucket se não for removido depois que o novo já está salvo com sucesso.
  if (caminho && existente?.caminho && existente.caminho !== caminho) {
    await supabase.storage.from(BUCKET).remove([existente.caminho]);
  }

  return res.data[0];
}

/** Abre o anexo numa aba nova — URL assinada de 60s, igual ao documento. */
export async function abrirArquivoFerias(item) {
  if (!item?.caminho) throw new Error('Este período ainda não tem arquivo anexado.');
  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrl(item.caminho, VALIDADE_URL);
  if (error || !data?.signedUrl) {
    throw error || new Error('Não consegui gerar o link do arquivo.');
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

/** Tira o anexo mas mantém o período registrado. */
export async function removerArquivoFerias(item) {
  if (!item?.caminho) return item;
  const res = await supabase.from('ferias').update({
    caminho: null, nome_arquivo: null, mime: null, tamanho_bytes: null,
  }).eq('id', item.id).select();
  if (res.error || !res.data?.length) {
    throw res.error || new Error('Não consegui desanexar o arquivo.');
  }
  await supabase.storage.from(BUCKET).remove([item.caminho]);
  return res.data[0];
}

/** Apaga o período inteiro (e o arquivo do bucket, se houver). */
export async function excluirFerias(item) {
  const res = await supabase.from('ferias').delete().eq('id', item.id).select();
  if (res.error || !res.data?.length) {
    throw res.error || new Error('Não consegui excluir as férias.');
  }
  if (item.caminho) await supabase.storage.from(BUCKET).remove([item.caminho]);
  return true;
}
