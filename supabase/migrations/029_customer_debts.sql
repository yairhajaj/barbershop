CREATE TABLE public.customer_debts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON public.customer_debts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Customer read own" ON public.customer_debts
  FOR SELECT USING (customer_id = auth.uid());
