-- Execute este script no SQL Editor do seu projeto Supabase
-- para atualizar a tabela profiles com o suporte a equipe.

-- 1. Adicionar coluna role se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'therapist' CHECK (role IN ('therapist', 'secretary', 'admin'));
    END IF;
END $$;

-- 2. Adicionar coluna employer_id se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='employer_id') THEN
        ALTER TABLE public.profiles ADD COLUMN employer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Adicionar coluna email se não existir (para exibição facilitada)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='email') THEN
        ALTER TABLE public.profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- 4. Notificar o Supabase para atualizar o cache do esquema
NOTIFY pgrst, 'reload schema';
