# Finance Configuration System

This directory contains the configuration system for the finance application. It allows you to customize various aspects of the application without modifying the core code.

## Structure

- `defaults/` - Contains default configurations that ship with the application
- `user/` - Place your custom configurations here to override defaults

## Configuration Components

The system is split into multiple configuration files, each handling a different aspect:

### Categories (`categories.mjs`)

Defines the transaction categorization hierarchy. Customize by:

```javascript
export default {
  // Add new categories
  add: {
    property: {
      property_my_new_property: {}
    }
  },

  // Remove categories you don't use
  remove: ['experiences']
}
```

### Merchant Category Rules (`rules.mjs`)

Rules that map merchant names to categories. Customize by:

```javascript
export default {
  // Add new rules
  add: [
    {
      pattern: /netflix|hulu|disney\+/i,
      categories: ['subscriptions.streaming']
    }
  ],

  // Remove rules you want to replace
  remove: [/pattern_to_remove/i]
}
```

### Transfer Detection (`transfers.mjs`)

Patterns to identify transfer transactions:

```javascript
export default {
  // Add new patterns for ally
  ally: [
    ...default patterns...,
    /my_custom_pattern/i
  ],

  // Create patterns for a new institution
  my_bank: [
    /transfer/i,
    /payment/i
  ]
}
```

### Merchant Name Formatting (`merchants.mjs`)

Rules for standardizing merchant names:

```javascript
export default {
  // Add rules for a new format
  my_bank: [{ pattern: /PREFIX\s+/, replacement: '' }],

  // Add special case handling
  special_cases: [
    {
      test: (text, format) => format === 'my_bank' && text.includes('SPECIAL'),
      result: 'STANDARDIZED_NAME'
    }
  ]
}
```

### Link Formatting (`links.mjs`)

Rules for generating links from merchant names:

```javascript
export default {
  // Add special institution mappings
  institutions: [
    {
      patterns: [/my bank|mybank/i],
      link: '/bank/mybank'
    }
  ],

  // Default link format function for merchants not specifically mapped
  default_format: (clean_name) => `/custom/${clean_name}`
}
```
