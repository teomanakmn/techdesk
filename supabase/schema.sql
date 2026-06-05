-- ============================================================
-- TechDesk — Kurumsal IT Destek Sistemi
-- Supabase SQL Şeması
-- ============================================================
-- Bu dosyayı Supabase Dashboard → SQL Editor'da çalıştırın.
-- Sırasıyla: 1) Tablolar, 2) Trigger Function, 3) Trigger
-- ============================================================


-- ************************************************************
-- 1) PROFILES TABLOSU
-- ************************************************************
-- auth.users tablosuyla 1:1 ilişkili kullanıcı profil tablosu.
-- Yeni bir kullanıcı kaydolduğunda trigger ile otomatik oluşturulur.
--
-- Sütunlar:
--   id         → auth.users.id ile aynı UUID (Foreign Key)
--   full_name  → Kullanıcının tam adı
--   role       → Kullanıcı rolü: 'user', 'it_staff' veya 'admin'
--   created_at → Profilin oluşturulma tarihi (otomatik)
-- ************************************************************

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user'
             CHECK (role IN ('user', 'it_staff', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles tablosu için açıklama
COMMENT ON TABLE  public.profiles             IS 'Kullanıcı profil bilgileri — auth.users ile 1:1 ilişkili';
COMMENT ON COLUMN public.profiles.id          IS 'auth.users tablosundaki kullanıcı UUID''si';
COMMENT ON COLUMN public.profiles.role        IS 'Kullanıcı rolü: user (son kullanıcı), it_staff (IT personeli), admin (yönetici)';

-- RLS (Row Level Security) etkinleştir — Supabase güvenlik için zorunlu tutar
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Herkes kendi profilini görebilsin
CREATE POLICY "Kullanıcılar kendi profilini görebilir"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Herkes kendi profilini güncelleyebilsin
CREATE POLICY "Kullanıcılar kendi profilini güncelleyebilir"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admin ve IT personeli tüm profilleri görebilsin (kullanıcı yönetimi ekranı)
CREATE POLICY "Admin ve IT tum profilleri gorebilir"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'it_staff')
    )
  );

-- Sadece admin, diğer kullanıcıların rolünü güncelleyebilsin
CREATE POLICY "Admin tum profilleri guncelleyebilir"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );


-- ************************************************************
-- 2) TICKETS (Destek Talepleri) TABLOSU
-- ************************************************************
-- IT destek taleplerini saklayan ana tablo.
--
-- Sütunlar:
--   id          → Otomatik artan benzersiz kimlik (UUID)
--   title       → Talep başlığı
--   description → Detaylı açıklama
--   status      → Talep durumu: 'open', 'in_progress', 'resolved'
--   priority    → Öncelik seviyesi: 'low', 'medium', 'high', 'critical'
--   user_id     → Talebi oluşturan kullanıcı (profiles FK)
--   assigned_to → Talebin atandığı IT personeli (profiles FK, nullable)
--   created_at  → Oluşturulma tarihi
-- ************************************************************

CREATE TABLE public.tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets tablosu için açıklamalar
COMMENT ON TABLE  public.tickets              IS 'IT destek talepleri';
COMMENT ON COLUMN public.tickets.status       IS 'Talep durumu: open (açık), in_progress (işlemde), resolved (çözüldü)';
COMMENT ON COLUMN public.tickets.priority     IS 'Öncelik: low (düşük), medium (orta), high (yüksek), critical (kritik)';
COMMENT ON COLUMN public.tickets.assigned_to  IS 'Talebin atandığı IT personelinin profil ID''si';

-- Performans için index'ler
CREATE INDEX idx_tickets_user_id     ON public.tickets(user_id);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_status      ON public.tickets(status);

-- RLS etkinleştir
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar kendi taleplerini görebilir
CREATE POLICY "Kullanıcılar kendi taleplerini görebilir"
  ON public.tickets FOR SELECT
  USING (auth.uid() = user_id);

-- IT personeli ve adminler tüm talepleri görebilir
CREATE POLICY "IT personeli tüm talepleri görebilir"
  ON public.tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('it_staff', 'admin')
    )
  );

-- Kullanıcılar yeni talep oluşturabilir
CREATE POLICY "Kullanıcılar talep oluşturabilir"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- IT personeli talepleri güncelleyebilir (durum değiştirme, atama vb.)
CREATE POLICY "IT personeli talepleri güncelleyebilir"
  ON public.tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('it_staff', 'admin')
    )
  );


-- ************************************************************
-- 3) COMMENTS (Yorumlar) TABLOSU
-- ************************************************************
-- Destek taleplerine yapılan yorumları saklayan tablo.
--
-- Sütunlar:
--   id         → Benzersiz yorum kimliği (UUID)
--   ticket_id  → Hangi talebe ait olduğu (tickets FK)
--   user_id    → Yorumu yazan kullanıcı (profiles FK)
--   content    → Yorum içeriği
--   created_at → Oluşturulma tarihi
-- ************************************************************

CREATE TABLE public.comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments tablosu için açıklamalar
COMMENT ON TABLE  public.comments           IS 'Destek taleplerine yapılan yorumlar';
COMMENT ON COLUMN public.comments.ticket_id IS 'Yorumun ait olduğu talep ID''si';

-- Performans için index
CREATE INDEX idx_comments_ticket_id ON public.comments(ticket_id);

-- RLS etkinleştir
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- İlgili talebe erişimi olan herkes yorumları görebilir
CREATE POLICY "Talebe erişimi olanlar yorumları görebilir"
  ON public.comments FOR SELECT
  USING (
    -- Yorumun ait olduğu talebin sahibi veya IT personeli
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND (
          t.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('it_staff', 'admin')
          )
        )
    )
  );

-- Giriş yapmış kullanıcılar yorum ekleyebilir
CREATE POLICY "Kullanıcılar yorum ekleyebilir"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ************************************************************
-- 4) TRIGGER FUNCTION — Otomatik Profil Oluşturma
-- ************************************************************
-- Yeni bir kullanıcı auth.users tablosuna kaydolduğunda
-- bu fonksiyon otomatik olarak profiles tablosuna bir satır ekler.
--
-- raw_user_meta_data: Kayıt sırasında gönderilen ek veriler
--   Örn: supabase.auth.signUp({ email, password, options: {
--           data: { full_name: 'Ali Veli' }
--         }})
-- ************************************************************

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- auth.users'a erişim için gerekli
SET search_path = public  -- Güvenlik: search_path sabitle
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,                                                    -- auth.users.id
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),      -- metadata'dan isim al
    'user'                                                     -- Varsayılan rol: user
  );
  RETURN NEW;
END;
$$;

-- Fonksiyon açıklaması
COMMENT ON FUNCTION public.handle_new_user()
  IS 'auth.users''a yeni kayıt eklendiğinde profiles tablosuna otomatik profil oluşturur';


-- ************************************************************
-- 5) TRIGGER — Fonksiyonu auth.users'a Bağla
-- ************************************************************
-- AFTER INSERT: Yeni kullanıcı eklendikten SONRA çalışır
-- FOR EACH ROW: Her yeni satır için bir kez tetiklenir
-- ************************************************************

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
