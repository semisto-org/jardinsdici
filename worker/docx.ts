// Texte brut d'un fichier Word (.docx), pour la recherche dans les documents. Lecture minimale du ZIP, sans dépendance.

/** Contenu décompressé d'un fichier du ZIP, ou null s'il n'y est pas. */
async function unzipEntry(zip: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire éventuel).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(start, start + compressed);
    if (method === 0) return data;
    if (method !== 8) return null;
    const out = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Texte d'un .docx, un paragraphe par ligne. null si le fichier n'est pas lisible. */
export async function docxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const xml = await unzipEntry(bytes, "word/document.xml");
    if (!xml) return null;
    return new TextDecoder().decode(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>|<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : ENTITIES[e] ?? m)
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return null;
  }
}
