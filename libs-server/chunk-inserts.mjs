const get_chunks = (inserts, chunk_size) => {
  const chunks = []
  for (let i = 0; i < inserts.length; i += chunk_size) {
    chunks.push(inserts.slice(i, i + chunk_size))
  }
  return chunks
}

export default async function ({ inserts, chunk_size = 1000, save } = {}) {
  const chunks = get_chunks(inserts, chunk_size)
  for (const chunk of chunks) {
    await save(chunk)
  }
}
