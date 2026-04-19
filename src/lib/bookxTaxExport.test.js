/**
 * bookxTaxExport.test.js
 * Run: npx vitest run src/lib/bookxTaxExport.test.js
 */

import { describe, test, expect, vi, beforeAll } from 'vitest'

// Mock supabase before any module that imports it is loaded
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select:  vi.fn().mockReturnThis(),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
      update:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockResolvedValue({ error: null }),
      gte:     vi.fn().mockReturnThis(),
      lte:     vi.fn().mockReturnThis(),
      order:   vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}))

import { OPERATOR } from '../config/operator'
import {
  generateINI,
  generateBKMV,
  validateIntegrity,
  generateSampleFiles,
} from './bookxTaxExport'

// ─── Shared test fixtures ────────────────────────────────────────
const TENANT = {
  business_name:               'עסק בדיקה בע"מ',
  business_tax_id:             '123456789',
  business_address_street:     'רחוב הבדיקה',
  business_address_number:     '5',
  business_address_city:       'תל אביב',
  business_address_postal:     '6100000',
  company_registration_number: '511111111',
  deduction_file_number:       '000000000',
  has_branches:                false,
  business_type:               'osek_morsheh',
}
const PERIOD = { from: '2024-01-01', to: '2024-12-31' }

const SAMPLE_INVOICES = [
  {
    id: 'inv-001', invoice_number: 'INV-001', customer_name: 'לקוח א',
    amount_before_vat: 100, vat_rate: 18, vat_amount: 18, total_amount: 118,
    status: 'paid', payment_method: 'cash',
    service_date: '2024-03-15T10:00:00Z', created_at: '2024-03-15T10:00:00Z', paid_at: '2024-03-15T10:00:00Z',
    is_credit_note: false, is_cancelled: false,
    invoice_items: [
      { id: 'item-1a', service_id: 'svc-1', name: 'תספורת', quantity: 1, unit_price: 60,  line_total: 60  },
      { id: 'item-1b', service_id: 'svc-1', name: 'פן',     quantity: 1, unit_price: 40,  line_total: 40  },
    ],
  },
  {
    id: 'inv-002', invoice_number: 'INV-002', customer_name: 'לקוח ב',
    amount_before_vat: 200, vat_rate: 18, vat_amount: 36, total_amount: 236,
    status: 'paid', payment_method: 'credit',
    service_date: '2024-06-10T12:00:00Z', created_at: '2024-06-10T12:00:00Z', paid_at: '2024-06-10T12:00:00Z',
    is_credit_note: false, is_cancelled: false,
    invoice_items: [
      { id: 'item-2a', service_id: 'svc-2', name: 'צביעה', quantity: 1, unit_price: 200, line_total: 200 },
    ],
  },
]

// ─── Tests ───────────────────────────────────────────────────────

describe('BOOKX operator config', () => {
  test('software_name is BOOKX', () => {
    expect(OPERATOR.software_name).toBe('BOOKX')
  })

  test('manufacturer_vat_id is 9 digits', () => {
    expect(/^\d{9}$/.test(OPERATOR.manufacturer_vat_id)).toBe(true)
  })
})

describe('generateINI', () => {
  let result

  beforeAll(() => {
    result = generateINI(TENANT, PERIOD)
  })

  test('returns text and primaryId', () => {
    expect(result).toHaveProperty('text')
    expect(result).toHaveProperty('primaryId')
    expect(result.primaryId).toMatch(/^\d{15}$/)
  })

  test('A000 record is 466 chars (+ CRLF = 468)', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const a000 = lines.find(l => l.startsWith('A000'))
    expect(a000).toBeDefined()
    expect(a000.length).toBe(466)
  })

  test('A100 record is 95 chars', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const a100 = lines.find(l => l.startsWith('A100'))
    expect(a100).toBeDefined()
    expect(a100.length).toBe(95)
  })

  test('Z900 record is 110 chars', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const z900 = lines.find(l => l.startsWith('Z900'))
    expect(z900).toBeDefined()
    expect(z900.length).toBe(110)
  })

  test('all lines end with CRLF', () => {
    const raw = result.text
    // Every line terminator must be \r\n, not bare \n
    const bareNewlines = raw.replace(/\r\n/g, '').includes('\n')
    expect(bareNewlines).toBe(false)
  })

  test('software name BOOKX appears in A000', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const a000 = lines.find(l => l.startsWith('A000'))
    expect(a000).toContain('BOOKX')
  })

  test('INI contains exactly 3 records (A000 + A100 + Z900)', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    expect(lines.length).toBe(3)
  })
})

describe('generateBKMV', () => {
  let result

  beforeAll(() => {
    const vatId     = '123456789'
    const primaryId = '123456789012345'
    result = generateBKMV({ vatId, primaryId, invoices: SAMPLE_INVOICES, services: [], businessType: 'osek_morsheh' })
  })

  test('returns text and counts', () => {
    expect(result).toHaveProperty('text')
    expect(result).toHaveProperty('counts')
  })

  test('C100 record is 444 chars', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const c100 = lines.find(l => l.startsWith('C100'))
    expect(c100).toBeDefined()
    expect(c100.length).toBe(444)
  })

  test('D110 record is 339 chars', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const d110 = lines.find(l => l.startsWith('D110'))
    expect(d110).toBeDefined()
    expect(d110.length).toBe(339)
  })

  test('D120 record is 222 chars', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    const d120 = lines.find(l => l.startsWith('D120'))
    expect(d120).toBeDefined()
    expect(d120.length).toBe(222)
  })

  test('generates 2 C100 records (one per invoice)', () => {
    expect(result.counts.C100).toBe(2)
  })

  test('generates 3 D110 records (2 from inv-1, 1 from inv-2)', () => {
    expect(result.counts.D110).toBe(3)
  })

  test('generates 2 D120 records (both invoices are paid)', () => {
    expect(result.counts.D120).toBe(2)
  })

  test('all lines end with CRLF only', () => {
    const bareNewlines = result.text.replace(/\r\n/g, '').includes('\n')
    expect(bareNewlines).toBe(false)
  })

  test('first data record is C100 (A100 lives in INI.TXT)', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    expect(lines[0].startsWith('C100')).toBe(true)
  })

  test('last record is Z900', () => {
    const lines = result.text.split('\r\n').filter(Boolean)
    expect(lines[lines.length - 1].startsWith('Z900')).toBe(true)
  })
})

describe('validateIntegrity', () => {
  test('passes when D110 sums match C100', () => {
    const result = validateIntegrity({ invoices: SAMPLE_INVOICES })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('fails when D110 sum does not match amount_before_vat', () => {
    const broken = [{
      ...SAMPLE_INVOICES[0],
      amount_before_vat: 999,
      invoice_items: [
        { id: 'x', name: 'test', quantity: 1, unit_price: 50, line_total: 50 },
      ],
    }]
    const result = validateIntegrity({ invoices: broken })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/D110/)
  })

  test('fails when paid invoice has total = 0', () => {
    const broken = [{ ...SAMPLE_INVOICES[0], total_amount: 0, amount_before_vat: 0, invoice_items: [] }]
    const result = validateIntegrity({ invoices: broken })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/D120/)
  })

  test('passes with empty invoices list', () => {
    const result = validateIntegrity({ invoices: [] })
    expect(result.valid).toBe(true)
  })
})

describe('multi-tenant isolation', () => {
  test('vatId in generated files matches tenantData', () => {
    const tenantA = { ...TENANT, business_tax_id: '111111111' }
    const tenantB = { ...TENANT, business_tax_id: '222222222' }
    const { text: iniA } = generateINI(tenantA, PERIOD)
    const { text: iniB } = generateINI(tenantB, PERIOD)

    // A000 contains the vatId in the authorized dealer field
    expect(iniA).toContain('111111111')
    expect(iniB).toContain('222222222')
    // Cross-contamination check
    expect(iniA).not.toContain('222222222')
    expect(iniB).not.toContain('111111111')
  })
})

describe('generateSampleFiles', () => {
  test('produces >= 2000 data records (for simulator)', async () => {
    const { counts, totalRecords } = await generateSampleFiles(500)
    // 500 invoices × 2 D110 + 1 C100 + 1 D120 = 2000 + 5 M100 + A100 + Z900 = 2007
    expect(counts.C100 + counts.D110 + counts.D120 + counts.M100).toBeGreaterThanOrEqual(2000)
    expect(totalRecords).toBeGreaterThanOrEqual(2002)
  }, 30000)

  test('returns a Blob', async () => {
    const { blob } = await generateSampleFiles(10)
    expect(blob).toBeInstanceOf(Blob)
  }, 15000)

  test('dirPrefix matches OPENFRMT/<vatId>.<YY>/<MMDDhhmm>/ format', async () => {
    const { dirPrefix } = await generateSampleFiles(10)
    expect(dirPrefix).toMatch(/^OPENFRMT\/\d{9}\.\d{2}\/\d{8}\/$/)
  }, 15000)
})
