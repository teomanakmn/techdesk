-- System Settings tablosu oluşturuluyor
CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY DEFAULT 1,
  maintenance_mode boolean NOT NULL DEFAULT false,
  allow_new_registrations boolean NOT NULL DEFAULT true,
  require_email_verification boolean NOT NULL DEFAULT false,
  session_timeout integer NOT NULL DEFAULT 120,
  support_email text NOT NULL DEFAULT 'support@techdesk.com',
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  
  -- Tablonun sadece tek bir satıra (id = 1) sahip olmasını zorla
  CONSTRAINT single_row CHECK (id = 1)
);

-- RLS (Row Level Security) ayarları
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (Misafirler, Kayıtlı Kullanıcılar)
CREATE POLICY "Ayarları herkes okuyabilir"
ON public.system_settings
FOR SELECT
USING (true);

-- Sadece "admin" rolüne sahip kullanıcılar güncelleyebilir
CREATE POLICY "Sadece adminler güncelleyebilir"
ON public.system_settings
FOR UPDATE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Sadece "admin" rolüne sahip kullanıcılar insert yapabilir
CREATE POLICY "Sadece adminler insert yapabilir"
ON public.system_settings
FOR INSERT
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Varsayılan ayar satırını ekle (eğer yoksa)
INSERT INTO public.system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
