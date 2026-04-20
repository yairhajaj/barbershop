// SaaS operator identity — set by Yair (software manufacturer), not by each business.
// These values are baked into every build and appear in the A000 record of OPENFRMT files.
// Fill in manufacturer_vat_id and tax_software_reg_number once you receive them.
export const OPERATOR = {
  manufacturer_name:        'חגג יאיר',    // שם יצרן התוכנה
  manufacturer_name_ascii:  'Hagag Yair',  // ASCII for OPENFRMT A000 field 1010
  manufacturer_vat_id:      '322605098',   // מספר עוסק יצרן התוכנה
  software_name:            'BOOKX',
  software_version:         '1.0',
  software_type:            2,             // 2 = רב-שנתי
  bookkeeping_type:         1,             // 1 = חד-צדית
  leading_currency:         'ILS',
  tax_software_reg_number:  '',            // 8 ספרות — ימולא אחרי אישור רשות המיסים
}
