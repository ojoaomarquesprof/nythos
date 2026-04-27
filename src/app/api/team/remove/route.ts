import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secretaryId = searchParams.get('id');

    if (!secretaryId) {
      return NextResponse.json({ error: 'ID da secretária não fornecido' }, { status: 400 });
    }

    // 1. Verificar se o solicitante é o psicólogo dono (employer_id)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    ) as any;

    const { data: { user: therapist } } = await supabase.auth.getUser();

    if (!therapist) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 2. Verificar se a secretária realmente pertence a este psicólogo
    const { data: secretaryProfile } = await supabase
      .from('profiles')
      .select('employer_id')
      .eq('id', secretaryId)
      .single();

    if (!secretaryProfile || secretaryProfile.employer_id !== therapist.id) {
      return NextResponse.json({ error: 'Você não tem permissão para remover esta secretária' }, { status: 403 });
    }

    // 3. Remover o usuário do Auth (isso deleta o profile também se tiver cascade, 
    // mas por segurança vamos remover o vínculo primeiro ou deletar o usuário direto)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(secretaryId);

    if (deleteError) {
      console.error('Erro ao deletar usuário Auth:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Acesso removido com sucesso!' 
    });

  } catch (error: any) {
    console.error('Erro ao remover membro da equipe:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
