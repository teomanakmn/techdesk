-- Bildirimler tablosu
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'info', -- 'info' | 'success' | 'warning'
  is_read boolean NOT NULL DEFAULT false,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları temizle (yeniden çalıştırma için)
DROP POLICY IF EXISTS "Kullanıcı kendi bildirimlerini görür" ON public.notifications;
DROP POLICY IF EXISTS "Sadece servis rolü yazabilir" ON public.notifications;
DROP POLICY IF EXISTS "Kullanıcı kendi bildirimini okuyabilir" ON public.notifications;
DROP POLICY IF EXISTS "Kullanıcı kendi bildirimini silebilir" ON public.notifications;

-- Kullanıcı sadece kendi bildirimlerini görebilir
CREATE POLICY "Kullanıcı kendi bildirimlerini görür"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Herkes ekleyebilir (service role zaten RLS'yi bypass eder)
CREATE POLICY "Herkes bildirim ekleyebilir"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Kullanıcı kendi bildirimini güncelleyebilir (okundu işareti)
CREATE POLICY "Kullanıcı kendi bildirimini güncelleyebilir"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Kullanıcı kendi bildirimini silebilir
CREATE POLICY "Kullanıcı kendi bildirimini silebilir"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- ⚡ REALTIME ETKİNLEŞTİR (kritik adım!)
-- Notifications tablosunu Supabase Realtime yayınına ekle
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
