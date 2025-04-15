// Default merchant name formatting rules
export default {
  default_formatters: {
    // Generic cleanup that applies to all formats if no specific rule matches
    clean_whitespace: (text) => text.replace(/\s+/g, ' ').trim()
  },

  // Format-specific rules
  ally: [
    { pattern: /^PwP\s+/, replacement: '' },
    { pattern: /\s+Privacycom$/, replacement: '' },
    { pattern: /\s*~\s*Future Amount.*$/, replacement: '' },
    { pattern: /\s*Tran:.*$/, replacement: '' },
    { pattern: /\s*REFCODE:.*$/, replacement: '' },
    { pattern: /\s*TRANNO:.*$/, replacement: '' }
  ],

  amex: [
    { pattern: /^AplPay\s+/, replacement: '' },
    { pattern: /\s+\d{5,}.*$/, replacement: '' },
    { pattern: /\s+[A-Z]{2}\s*$/, replacement: '' },
    { pattern: /\s+\(.*\)$/, replacement: '' }
  ],

  capital_one: [
    // Special handling for "IN *" prefix (handled in function)
    { pattern: /^SP\s+/, replacement: '' },
    { pattern: /^BT\*/, replacement: '' },
    { pattern: /^IN\s+\*/, replacement: '' },
    // Amazon cases (handled in function)
    { pattern: /\s+#\d+\*?$/, replacement: '' },
    { pattern: /\s+[A-Z]{2}\s*$/, replacement: '' },
    { pattern: /\s*\*.*$/, replacement: '' }
  ],

  chase: [
    { pattern: /\s+#\d+\*?$/, replacement: '' },
    { pattern: /\s+[A-Z]{2}\s*$/, replacement: '' },
    { pattern: /^TST\*\s*/, replacement: '' },
    { pattern: /^SQ \*/, replacement: '' },
    { pattern: /^DD \*/, replacement: '' },
    // Amazon cases (handled in function)
    { pattern: /\s+ECOMM$/, replacement: '' },
    { pattern: /\s+ONLINE$/, replacement: '' }
  ],

  // Special case handling rules
  special_cases: [
    {
      test: (text, format) =>
        format === 'capital_one' &&
        (text.match(/^AMZN\s+Mktp\s+US\*[A-Z0-9]+/) ||
          text.match(/^Amazon\.com\*[A-Z0-9]+/)),
      result: 'AMAZON'
    },
    {
      test: (text, format) =>
        format === 'chase' &&
        (text.match(/^AMZN Mktp US\*[A-Z0-9]+/) ||
          text.match(/^Amazon\.com\*[A-Z0-9]+/)),
      result: 'AMAZON'
    }
  ]
}
