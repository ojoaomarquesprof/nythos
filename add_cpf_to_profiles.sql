-- Adicionar coluna CPF à tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cpf TEXT;

-- Atualizar a função de gatilho para incluir o CPF e CRP no perfil ao criar novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, crp, cpf)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'crp',
    new.raw_user_meta_data->>'cpf'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
