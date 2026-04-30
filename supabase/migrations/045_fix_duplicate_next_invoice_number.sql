-- מתקן: עומס יתר על next_invoice_number — שתי גרסאות (עם ובלי tenant_id)
-- גרמו ל-RPC לזרוק "function next_invoice_number() is not unique",
-- ואז ה-frontend הכניס NULL ל-invoices.invoice_number → הפרת NOT NULL.
-- הגרסה הישנה גם הייתה SECURITY DEFINER + LIMIT 1 ללא tenant filter
-- (חשיפה אפשרית בין tenants). משאירים רק את הגרסה המודעת ל-tenant.
DROP FUNCTION IF EXISTS public.next_invoice_number();
