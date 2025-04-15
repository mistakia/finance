import fs from 'fs'
import csv from 'csv-parser'

const read_csv = (filepath, csv_options = {}) =>
  new Promise((resolve, reject) => {
    const results = []
    fs.createReadStream(filepath)
      .pipe(csv(csv_options))
      .on('data', (data) => results.push(data))
      .on('error', (error) => resolve(error))
      .on('end', () => resolve(results))
  })

export default read_csv
