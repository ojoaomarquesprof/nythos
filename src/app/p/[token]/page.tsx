import { notFound } from "next/navigation";
import { getPatientByToken } from "@/app/actions/patient-auth";
import { PatientTokenForm } from "./token-form";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props) {
  return { title: "Acesso Seguro · Nythos" };
}

export default async function PatientTokenPage({ params }: Props) {
  const { token } = await params;

  const result = await getPatientByToken(token);

  // Se o token não existir de forma alguma — 404 limpo
  if (!result.success && result.error?.includes("não encontrado")) {
    notFound();
  }

  return (
    <PatientTokenForm
      token={token}
      firstName={result.firstName ?? null}
    />
  );
}
