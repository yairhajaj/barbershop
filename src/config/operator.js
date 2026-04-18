// SaaS operator identity — set by Yair (software manufacturer), not by each business.
// These values are baked into every build and appear in the A000 record of OPENFRMT files.
// Fill in manufacturer_vat_id and tax_software_reg_number once you receive them.
export const OPERATOR = {
  manufacturer_name:        'Yair Hajaj',  // שם יצרן התוכנה
  manufacturer_vat_id:      '',            // ת.ז / ח.פ יצרן — למלא
  software_name:            'Hajaj Booking',
  software_version:         '1.0',
  software_type:            2,             // 2 = רב-שנתי
  bookkeeping_type:         1,             // 1 = חד-צדית
  leading_currency:         'ILS',
  tax_software_reg_number:  '',            // 8 ספרות — ימולא אחרי אישור רשות המיסים
}
