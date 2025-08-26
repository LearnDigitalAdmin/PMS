// FormatUtils.tsx - Text & Data Formatting Utilities

// ==================== CURRENCY FORMATTING ====================

/**
 * Formats currency for display (Kenyan Shilling)
 */
export function formatCurrency(
  amount: number,
  options: {
    showSymbol?: boolean;
    currency?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showCurrencyCode?: boolean;
  } = {}
): string {
  const {
    showSymbol = true,
    currency = 'KES',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showCurrencyCode = true
  } = options;

  if (isNaN(amount)) {
    return showSymbol ? (showCurrencyCode ? 'KES 0.00' : '0.00') : '0.00';
  }

  const formatter = new Intl.NumberFormat('en-KE', {
    style: showSymbol ? 'currency' : 'decimal',
    currency: currency,
    minimumFractionDigits,
    maximumFractionDigits
  });

  let formatted = formatter.format(amount);

  if (showSymbol && showCurrencyCode) {
    // Ensure proper spacing with currency code
    formatted = formatted.replace('KES', 'KES ').replace(/\s+/g, ' ');
  } else if (showSymbol && !showCurrencyCode) {
    // Remove currency code but keep symbol
    formatted = formatted.replace('KES', '').trim();
  }

  return formatted;
}

/**
 * Formats currency for input fields (no symbol)
 */
export function formatCurrencyInput(amount: number): string {
  return formatCurrency(amount, { showSymbol: false });
}

/**
 * Formats currency compactly (e.g., 1.2K, 1.5M)
 */
export function formatCurrencyCompact(
  amount: number,
  options: { showSymbol?: boolean; currency?: string } = {}
): string {
  const { showSymbol = true, currency = 'KES' } = options;
  
  if (isNaN(amount)) return showSymbol ? 'KES 0' : '0';

  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const prefix = showSymbol ? `${sign}${currency} ` : sign;

  if (absAmount >= 1000000000) {
    return `${prefix}${(absAmount / 1000000000).toFixed(1)}B`;
  } else if (absAmount >= 1000000) {
    return `${prefix}${(absAmount / 1000000).toFixed(1)}M`;
  } else if (absAmount >= 1000) {
    return `${prefix}${(absAmount / 1000).toFixed(1)}K`;
  } else {
    return `${prefix}${absAmount.toFixed(0)}`;
  }
}

/**
 * Parses currency string to number
 */
export function parseCurrency(currencyString: string): number {
  if (!currencyString) return 0;
  
  // Remove currency symbols, spaces, and commas
  const cleanedString = currencyString
    .replace(/[KES\s,]/gi, '')
    .replace(/[^\d.-]/g, '');
  
  const parsed = parseFloat(cleanedString);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

// ==================== DATE FORMATTING ====================

/**
 * Formats date for display
 */
export function formatDate(
  date: Date | string,
  options: {
    format?: 'short' | 'medium' | 'long' | 'full' | 'custom';
    locale?: string;
    customFormat?: string;
  } = {}
): string {
  const { format = 'medium', locale = 'en-KE' } = options;
  
  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  switch (format) {
    case 'short':
      return dateObj.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    
    case 'medium':
      return dateObj.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    
    case 'long':
      return dateObj.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    
    case 'full':
      return dateObj.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    
    case 'custom':
      return formatCustomDate(dateObj, options.customFormat || 'dd/mm/yyyy');
    
    default:
      return dateObj.toLocaleDateString(locale);
  }
}

/**
 * Formats date with custom pattern
 */
function formatCustomDate(date: Date, pattern: string): string {
  const map: Record<string, string> = {
    'yyyy': date.getFullYear().toString(),
    'yy': date.getFullYear().toString().slice(-2),
    'MM': (date.getMonth() + 1).toString().padStart(2, '0'),
    'M': (date.getMonth() + 1).toString(),
    'dd': date.getDate().toString().padStart(2, '0'),
    'd': date.getDate().toString(),
    'HH': date.getHours().toString().padStart(2, '0'),
    'mm': date.getMinutes().toString().padStart(2, '0'),
    'ss': date.getSeconds().toString().padStart(2, '0')
  };

  let formatted = pattern;
  Object.entries(map).forEach(([key, value]) => {
    formatted = formatted.replace(new RegExp(key, 'g'), value);
  });

  return formatted;
}

/**
 * Formats relative time (e.g., "2 days ago", "in 3 hours")
 */
export function formatRelativeTime(
  date: Date | string,
  options: { locale?: string } = {}
): string {
  const { locale = 'en-KE' } = options;
  
  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];

  if (Math.abs(diffInSeconds) < 60) {
    return 'just now';
  }

  for (const interval of intervals) {
    const count = Math.floor(Math.abs(diffInSeconds) / interval.seconds);
    if (count > 0) {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return rtf.format(diffInSeconds < 0 ? count : -count, interval.label as Intl.RelativeTimeFormatUnit);
    }
  }

  return formatDate(dateObj, { format: 'short' });
}

/**
 * Formats billing month display
 */
export function formatBillingMonth(billingMonth: string): string {
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return 'Invalid Month';
  }

  const date = new Date(billingMonth + '-01');
  return date.toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric'
  });
}

// ==================== PHONE NUMBER FORMATTING ====================

/**
 * Formats phone number for display
 */
export function formatPhoneNumber(
  phone: string,
  options: {
    format?: 'international' | 'national' | 'compact';
    countryCode?: string;
  } = {}
): string {
  const { format = 'national', countryCode = 'KE' } = options;
  
  if (!phone) return '';
  
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Handle Kenyan phone numbers
  if (countryCode === 'KE') {
    // Convert to standard format
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('+254')) {
      cleaned = cleaned.substring(1);
    } else if (!cleaned.startsWith('254')) {
      return phone; // Return original if not recognizable format
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('254')) {
      const areaCode = cleaned.substring(3, 6);
      const firstPart = cleaned.substring(6, 9);
      const secondPart = cleaned.substring(9, 12);
      
      switch (format) {
        case 'international':
          return `+254 ${areaCode} ${firstPart} ${secondPart}`;
        case 'national':
          return `0${areaCode} ${firstPart} ${secondPart}`;
        case 'compact':
          return `0${areaCode}${firstPart}${secondPart}`;
        default:
          return `0${areaCode} ${firstPart} ${secondPart}`;
      }
    }
  }
  
  return phone; // Return original if formatting fails
}

/**
 * Formats phone number for links (tel:)
 */
export function formatPhoneForLink(phone: string): string {
  if (!phone) return '';
  
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Ensure international format for links
  if (cleaned.startsWith('0')) {
    cleaned = '+254' + cleaned.substring(1);
  } else if (cleaned.startsWith('254') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

// ==================== ADDRESS FORMATTING ====================

/**
 * Formats address for display
 */
export function formatAddress(
  address: string | {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  },
  options: {
    format?: 'single-line' | 'multi-line';
    separator?: string;
  } = {}
): string {
  const { format = 'single-line', separator = ', ' } = options;
  
  if (typeof address === 'string') {
    return address.trim();
  }
  
  if (typeof address === 'object') {
    const parts = [
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country
    ].filter(part => part && part.trim());
    
    if (format === 'multi-line') {
      return parts.join('\n');
    } else {
      return parts.join(separator);
    }
  }
  
  return '';
}

// ==================== TEXT FORMATTING ====================

/**
 * Capitalizes first letter of each word
 */
export function titleCase(text: string): string {
  if (!text) return '';
  
  return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Capitalizes first letter only
 */
export function capitalize(text: string): string {
  if (!text) return '';
  
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Truncates text with ellipsis
 */
export function truncateText(
  text: string,
  maxLength: number,
  options: {
    suffix?: string;
    wordBoundary?: boolean;
  } = {}
): string {
  const { suffix = '...', wordBoundary = true } = options;
  
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  let truncated = text.substring(0, maxLength - suffix.length);
  
  if (wordBoundary) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }
  }
  
  return truncated + suffix;
}

/**
 * Formats text for display with proper line breaks
 */
export function formatTextDisplay(text: string): string {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n'); // Limit consecutive line breaks
}

/**
 * Extracts initials from name
 */
export function getInitials(name: string, maxChars: number = 2): string {
  if (!name) return '';
  
  const words = name.trim().split(/\s+/);
  const initials = words
    .slice(0, maxChars)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
  
  return initials;
}

// ==================== NUMBER FORMATTING ====================

/**
 * Formats number with thousands separators
 */
export function formatNumber(
  number: number,
  options: {
    decimals?: number;
    separator?: string;
    locale?: string;
  } = {}
): string {
  const { decimals, locale = 'en-KE' } = options;
  
  if (isNaN(number)) return '0';
  
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(number);
}

/**
 * Formats percentage
 */
export function formatPercentage(
  value: number,
  options: {
    decimals?: number;
    showSign?: boolean;
  } = {}
): string {
  const { decimals = 1, showSign = true } = options;
  
  if (isNaN(value)) return '0%';
  
  const formatted = value.toFixed(decimals);
  return showSign ? `${formatted}%` : formatted;
}

/**
 * Formats file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Formats duration in milliseconds to human readable
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ==================== UNIT FORMATTING ====================

/**
 * Formats utility units with appropriate suffix
 */
export function formatUnits(
  value: number,
  type: 'water' | 'electricity' | 'gas',
  options: { showUnit?: boolean } = {}
): string {
  const { showUnit = true } = options;
  
  if (isNaN(value)) return '0';
  
  const unitMap = {
    water: 'L', // Liters
    electricity: 'kWh', // Kilowatt hours
    gas: 'm³' // Cubic meters
  };
  
  const formattedValue = formatNumber(value, { decimals: 0 });
  
  return showUnit ? `${formattedValue} ${unitMap[type]}` : formattedValue;
}

/**
 * Formats area measurements
 */
export function formatArea(
  value: number,
  unit: 'sqm' | 'sqft' = 'sqm',
  options: { showUnit?: boolean; decimals?: number } = {}
): string {
  const { showUnit = true, decimals = 0 } = options;
  
  if (isNaN(value)) return '0';
  
  const unitMap = {
    sqm: 'm²',
    sqft: 'ft²'
  };
  
  const formattedValue = formatNumber(value, { decimals });
  
  return showUnit ? `${formattedValue} ${unitMap[unit]}` : formattedValue;
}

// ==================== STATUS FORMATTING ====================

/**
 * Formats status with appropriate styling hints
 */
export function formatStatus(
  status: string,
  type: 'payment' | 'invoice' | 'tenant' | 'general' = 'general'
): {
  text: string;
  variant: 'success' | 'warning' | 'error' | 'info' | 'default';
} {
  const normalizedStatus = status.toLowerCase().trim();
  
  switch (type) {
    case 'payment':
      switch (normalizedStatus) {
        case 'paid':
        case 'complete':
          return { text: 'Paid', variant: 'success' };
        case 'partial':
          return { text: 'Partial', variant: 'warning' };
        case 'unpaid':
        case 'pending':
          return { text: 'Unpaid', variant: 'error' };
        case 'overdue':
          return { text: 'Overdue', variant: 'error' };
        default:
          return { text: titleCase(status), variant: 'default' };
      }
      
    case 'invoice':
      switch (normalizedStatus) {
        case 'paid':
          return { text: 'Paid', variant: 'success' };
        case 'sent':
          return { text: 'Sent', variant: 'info' };
        case 'overdue':
          return { text: 'Overdue', variant: 'error' };
        case 'draft':
          return { text: 'Draft', variant: 'default' };
        default:
          return { text: titleCase(status), variant: 'default' };
      }
      
    case 'tenant':
      switch (normalizedStatus) {
        case 'active':
          return { text: 'Active', variant: 'success' };
        case 'inactive':
          return { text: 'Inactive', variant: 'warning' };
        case 'suspended':
          return { text: 'Suspended', variant: 'error' };
        default:
          return { text: titleCase(status), variant: 'default' };
      }
      
    default:
      return { text: titleCase(status), variant: 'default' };
  }
}

// ==================== SEARCH & FILTER FORMATTING ====================

/**
 * Formats search query for better matching
 */
export function formatSearchQuery(query: string): string {
  if (!query) return '';
  
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize spaces
}

/**
 * Highlights search terms in text
 */
// export function highlightSearchTerms(
//   text: string,
//   searchQuery: string,
//   options: {
//     highlightClass?: string;
//     caseSensitive?: boolean;
//   } = {}
// ): string {
//   const { highlightClass = 'highlight', caseSensitive = false } = options;
  
//   if (!text || !searchQuery) return text;
  
//   const flags = caseSensitive ? 'g' : 'gi';
//   const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\// ==================== EXPORT UTILITIES ====================

// export {
//   formatDate,
//   formatC');
//   const regex = new RegExp(escapedQuery, flags);
  
//   return text.replace(regex, `<span class="${highlightClass}">// ==================== EXPORT UTILITIES ====================

// export {
//   formatDate,
//   formatC</span>`);
// }

// ==================== DATA EXPORT FORMATTING ====================

/**
 * Formats data for CSV export
 */
export function formatForCSV(
  data: Record<string, any>[],
  options: {
    delimiter?: string;
    headers?: string[];
    dateFormat?: string;
  } = {}
): string {
  const { delimiter = ',', headers, dateFormat = 'short' } = options;
  
  if (!data.length) return '';
  
  const keys = headers || Object.keys(data[0]);
  const csvHeaders = keys.join(delimiter);
  
  const csvRows = data.map(row => {
    return keys.map(key => {
      let value = row[key];
      
      // Format different data types
      if (value instanceof Date) {
        value = formatDate(value, { format: dateFormat as any });
      } else if (typeof value === 'number') {
        value = value.toString();
      } else if (typeof value === 'boolean') {
        value = value ? 'Yes' : 'No';
      } else if (value == null) {
        value = '';
      } else {
        value = String(value);
      }
      
      // Escape quotes and wrap in quotes if contains delimiter or quotes
      if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      
      return value;
    }).join(delimiter);
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Formats data for printing
 */
export function formatForPrint(
  data: Record<string, any>,
  options: {
    title?: string;
    includeTimestamp?: boolean;
    dateFormat?: string;
  } = {}
): string {
  const { title, includeTimestamp = true, dateFormat = 'full' } = options;
  
  let output = '';
  
  if (title) {
    output += `${title}\n${'='.repeat(title.length)}\n\n`;
  }
  
  if (includeTimestamp) {
    output += `Generated: ${formatDate(new Date(), { format: dateFormat as any })}\n\n`;
  }
  
  Object.entries(data).forEach(([key, value]) => {
    const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
    const displayKey = titleCase(formattedKey);
    
    let displayValue = value;
    if (value instanceof Date) {
      displayValue = formatDate(value);
    } else if (typeof value === 'number' && key.toLowerCase().includes('amount')) {
      displayValue = formatCurrency(value);
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    } else if (value == null) {
      displayValue = 'N/A';
    }
    
    output += `${displayKey}: ${displayValue}\n`;
  });
  
  return output;
}

// ==================== URL & SLUG FORMATTING ====================

/**
 * Creates URL-friendly slug from text
 */
export function createSlug(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Formats URL parameters
 */
export function formatUrlParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  return searchParams.toString();
}

// ==================== COLOR FORMATTING ====================

/**
 * Generates consistent color for text (useful for avatars, tags)
 */
export function generateColorFromText(text: string): string {
  if (!text) return '#6B7280'; // Default gray
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Formats amount with color indication (positive/negative)
 */
export function formatAmountWithColor(
  amount: number,
  options: {
    showCurrency?: boolean;
    positiveColor?: string;
    negativeColor?: string;
  } = {}
): {
  text: string;
  color: string;
} {
  const { showCurrency = true, positiveColor = '#10B981', negativeColor = '#EF4444' } = options;
  
  const text = showCurrency ? formatCurrency(amount) : formatNumber(amount, { decimals: 2 });
  const color = amount >= 0 ? positiveColor : negativeColor;
  
  return { text, color };
}

// ==================== VALIDATION FORMATTING ====================

/**
 * Formats validation messages
 */
export function formatValidationMessage(
  field: string,
  error: string,
  options: {
    fieldNameTransform?: 'title' | 'sentence' | 'none';
  } = {}
): string {
  const { fieldNameTransform = 'sentence' } = options;
  
  let formattedField = field;
  
  switch (fieldNameTransform) {
    case 'title':
      formattedField = titleCase(field.replace(/([A-Z])/g, ' $1'));
      break;
    case 'sentence':
      formattedField = capitalize(field.replace(/([A-Z])/g, ' $1'));
      break;
    case 'none':
      break;
  }
  
  return `${formattedField}: ${error}`;
}

// ==================== TEMPLATE FORMATTING ====================

/**
 * Simple template string replacement
 */
export function formatTemplate(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value == null) return match;
    
    if (typeof value === 'number' && key.toLowerCase().includes('amount')) {
      return formatCurrency(value);
    } else if (value instanceof Date) {
      return formatDate(value);
    } else {
      return String(value);
    }
  });
}

/**
 * Formats message templates with user data
 */
export function formatMessageTemplate(
  template: string,
  data: Record<string, any>,
  options: {
    escapeHtml?: boolean;
  } = {}
): string {
  const { escapeHtml = false } = options;
  
  let formatted = formatTemplate(template, data);
  
  if (escapeHtml) {
    formatted = formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  return formatted;
}

// ==================== ACCESSIBILITY FORMATTING ====================

/**
 * Formats text for screen readers
 */
export function formatForScreenReader(
  text: string,
  type: 'currency' | 'date' | 'phone' | 'email' | 'text' = 'text'
): string {
  if (!text) return '';
  
  switch (type) {
    case 'currency':
      const amount = parseCurrency(text);
      return `${amount} Kenya Shillings`;
    
    case 'date':
      const date = new Date(text);
      if (!isNaN(date.getTime())) {
        return formatDate(date, { format: 'long' });
      }
      return text;
    
    case 'phone':
      return text.replace(/(\d)/g, '$1 ');
    
    case 'email':
      return text.replace('@', ' at ').replace('.', ' dot ');
    
    default:
      return text;
  }
}

/**
 * Creates ARIA label from data
 */
export function createAriaLabel(
  data: Record<string, any>,
  template?: string
): string {
  if (template) {
    return formatTemplate(template, data);
  }
  
  // Default formatting for common data types
  const parts: string[] = [];
  
  Object.entries(data).forEach(([key, value]) => {
    if (value != null) {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      const formattedValue = typeof value === 'number' && key.includes('amount') 
        ? formatForScreenReader(value.toString(), 'currency')
        : String(value);
      
      parts.push(`${formattedKey} ${formattedValue}`);
    }
  });
  
  return parts.join(', ');
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Safely converts any value to string
 */
export function safeToString(value: any): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

/**
 * Formats list of items with proper conjunction
 */
export function formatList(
  items: string[],
  options: {
    conjunction?: 'and' | 'or';
    maxItems?: number;
    moreText?: string;
  } = {}
): string {
  const { conjunction = 'and', maxItems, moreText = 'more' } = options;
  
  if (!items.length) return '';
  
  let displayItems = items;
  let hasMore = false;
  
  if (maxItems && items.length > maxItems) {
    displayItems = items.slice(0, maxItems);
    hasMore = true;
  }
  
  if (displayItems.length === 1) {
    return hasMore ? `${displayItems[0]} and ${items.length - 1} ${moreText}` : displayItems[0];
  }
  
  if (displayItems.length === 2) {
    const result = displayItems.join(` ${conjunction} `);
    return hasMore ? `${result} and ${items.length - maxItems!} ${moreText}` : result;
  }
  
  const lastItem = displayItems.pop();
  const result = `${displayItems.join(', ')}, ${conjunction} ${lastItem}`;
  return hasMore ? `${result} and ${items.length - maxItems!} ${moreText}` : result;
}

// ==================== MAIN EXPORTS ====================

// export {
//   formatDate,
//   formatCurrency
// };