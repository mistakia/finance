import dayjs from 'dayjs'
import { get_finance_config } from '#libs-server'

const parse_date = (date_str) => {
  const parts = date_str.split('/')
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0')
    const day = parts[1].padStart(2, '0')
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
    return `${year}-${month}-${day}`
  }
  return date_str
}

const get_amount = (record) => {
  if (record.Debit) {
    return -parseFloat(record.Debit.trim())
  }
  return record.Credit ? parseFloat(record.Credit.trim()) : 0
}

const generate_transaction_id = ({ transaction, institution }) => {
  const components = [
    institution,
    transaction['Transaction Date'],
    transaction['Posted Date'],
    transaction.Debit || transaction.Credit,
    transaction['Card No.'],
    transaction.Description
  ].filter(Boolean)
  return components.join('_')
}

export const parse_transactions = async ({ file_path, owner }) => {
  const { read_csv } = await import('#libs-server')
  const finance_config = await get_finance_config()
  const institution = 'capital-one'
  const account_link = `/${owner}/${institution}/credit-card/default`

  const records = await read_csv(file_path, {
    mapHeaders: ({ header }) => header.trim()
  })

  if (!records || !Array.isArray(records) || records.length === 0) {
    return []
  }

  const transactions = []

  for (const record of records) {
    if (!record || !record['Transaction Date']) continue

    const amount = get_amount(record)
    if (isNaN(amount)) continue

    const date = parse_date(record['Transaction Date'])
    const unix_timestamp = Math.floor(dayjs(date).valueOf() / 1000)
    const transaction_id = generate_transaction_id({
      transaction: record,
      institution
    })

    const merchant_name = finance_config.format_merchant_name({
      transaction_description: record.Description,
      format: 'capital-one'
    })

    const is_transfer = finance_config.is_transfer_transaction(
      record.Description,
      'capital-one',
      null
    )

    const categories = is_transfer
      ? ['transfer']
      : finance_config.get_merchant_categories(merchant_name)

    let transaction_type = 'purchase'
    if (is_transfer || categories.some((c) => c.includes('transfer'))) {
      transaction_type = 'transfer'
    } else if (amount > 0) {
      transaction_type = 'income'
    }

    const counterparty_link = await finance_config.format_link({
      transaction_description: record.Description,
      type: transaction_type,
      format: 'capital-one'
    })

    transactions.push({
      link: `/transaction/${transaction_id}`,
      transaction_type,
      from_link: amount < 0 ? account_link : counterparty_link,
      from_amount: amount < 0 ? amount : -amount,
      from_symbol: 'USD',
      to_link: amount < 0 ? counterparty_link : account_link,
      to_amount: amount < 0 ? -amount : amount,
      to_symbol: 'USD',
      transaction_unix: unix_timestamp,
      transaction_date: date,
      tx_id: transaction_id,
      description: merchant_name,
      categories,
      original_data: { ...record },
      source_file: file_path
    })
  }

  return transactions
}
