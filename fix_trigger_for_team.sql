-- Atualiza o gatilho para capturar role e employer_id dos metadados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, employer_id)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'therapist'),
    (new.raw_user_meta_data->>'employer_id')::uuid
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o perfil atual da secretaria (se houver) seja corrigido caso ela tente logar de novo
-- SUBSTITUA pelo email da sua secretária para um teste rápido
UPDATE public.profiles 
SET role = 'secretary', 
    employer_id = (SELECT id FROM profiles WHERE role = 'therapist' LIMIT 1) -- Aqui pegamos o primeiro terapeuta por segurança, mas o ideal é o seu ID
WHERE email = 'EMAIL_DA_SECRETARIA@EXEMPLO.COM';
