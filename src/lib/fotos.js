import { supabase } from './supabase';

export const BUCKET = 'fotos';

/* Lado maior da imagem guardada. O maior avatar da interface tem 52px;
   256 cobre telas retina com folga e o arquivo fica em ~25 KB. Guardar a
   foto original de celular (3–5 MB) faria a tela de colaboradores baixar
   dezenas de megabytes toda vez que abrisse. */
const LADO = 256;

/**
 * Reduz e recorta a imagem num quadrado de LADO px, no navegador, antes de
 * enviar. Recorte pelo centro: é onde o rosto está em foto de crachá.
 * Devolve um Blob JPEG.
 */
export function prepararFoto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo) return reject(new Error('Nenhum arquivo selecionado.'));
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
      return reject(new Error('Use uma imagem JPG, PNG ou WEBP.'));
    }

    const url = URL.createObjectURL(arquivo);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado) / 2;
        const sy = (img.height - lado) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = LADO;
        canvas.height = LADO;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao processar a imagem.'))),
          'image/jpeg',
          0.85
        );
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler esta imagem.'));
    };

    img.src = url;
  });
}

/**
 * Envia a foto já reduzida. O caminho é derivado do id do colaborador, então
 * trocar a foto sobrescreve a anterior em vez de acumular lixo no bucket.
 * Devolve o caminho para gravar em colaboradores.foto_path.
 */
export async function enviarFoto(colaboradorId, blob) {
  const caminho = `colaboradores/${colaboradorId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (error) throw error;
  // O caminho não muda quando a foto é trocada (upsert), então a URL em cache
  // continuaria mostrando a imagem antiga. Descarta esta entrada.
  cacheFotos.delete(caminho);
  return caminho;
}

export async function apagarFoto(caminho) {
  if (!caminho) return;
  await supabase.storage.from(BUCKET).remove([caminho]);
}

/**
 * O bucket é privado, então a imagem só abre com URL assinada e temporária.
 * Assinamos todas as fotos numa chamada só — uma por colaborador seria uma
 * cascata de requisições a cada carregamento da tela.
 * Devolve { caminho: url }.
 */
/* Cache das URLs assinadas.
   A assinatura vale 1 hora, mas a tela recarregava os dados a cada arraste,
   clique e evento de realtime — e cada recarga pedia assinatura de TODAS as
   fotos de novo. Numa equipe de 40 pessoas isso era uma ida à rede a cada
   gesto, pelo mesmo resultado. Agora só assinamos o que não está em cache.
   Guardamos com validade menor do que a real (50 min de 60) para nunca
   entregar uma URL que expira no meio do uso. */
const VALIDADE = 3600;
const FOLGA = 600;
const cacheFotos = new Map();

export function limparCacheFotos() {
  cacheFotos.clear();
}

export async function assinarFotos(caminhos) {
  const lista = Array.from(new Set((caminhos || []).filter(Boolean)));
  if (!lista.length) return {};

  const agora = Date.now();
  const mapaCache = {};
  const faltando = [];
  lista.forEach((caminho) => {
    const guardado = cacheFotos.get(caminho);
    if (guardado && guardado.expiraEm > agora) mapaCache[caminho] = guardado.url;
    else faltando.push(caminho);
  });

  // Tudo em cache: nenhuma ida à rede.
  if (!faltando.length) return mapaCache;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(faltando, VALIDADE);

  if (error) {
    // Sem foto a interface continua funcionando com as iniciais, então isto
    // é um aviso no console e não um erro na cara do usuário.
    console.warn('Não foi possível assinar as fotos:', error.message);
    // O que já estava em cache continua valendo mesmo se esta chamada falhou.
    return mapaCache;
  }

  const mapa = { ...mapaCache };
  const expiraEm = agora + (VALIDADE - FOLGA) * 1000;
  (data || []).forEach((item) => {
    if (item && item.signedUrl && !item.error) {
      mapa[item.path] = item.signedUrl;
      cacheFotos.set(item.path, { url: item.signedUrl, expiraEm });
    }
  });
  return mapa;
}
