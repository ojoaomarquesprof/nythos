// ============================================================
// Nythos — Constants
// ============================================================

export const APP_NAME = 'Nythos';
export const APP_DESCRIPTION = 'Gestão Clínica e Financeira para Psicólogos';

// Session status labels & colors
export const SESSION_STATUS = {
  scheduled: { label: 'Agendado', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  completed: { label: 'Realizado', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  missed: { label: 'Faltou', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
} as const;

// Session type labels
export const SESSION_TYPES = {
  individual: { label: 'Individual', icon: '👤' },
  couple: { label: 'Casal', icon: '👥' },
  group: { label: 'Grupo', icon: '👨‍👩‍👧‍👦' },
  online: { label: 'Online', icon: '💻' },
  initial_assessment: { label: 'Avaliação Inicial', icon: '📋' },
} as const;

// Cash flow categories
export const CASH_FLOW_CATEGORIES = {
  session: { label: 'Sessão', icon: '🧠' },
  package: { label: 'Pacote', icon: '📦' },
  other_income: { label: 'Outra Receita', icon: '💰' },
  rent: { label: 'Aluguel', icon: '🏠' },
  supplies: { label: 'Materiais', icon: '📎' },
  marketing: { label: 'Marketing', icon: '📣' },
  education: { label: 'Formação', icon: '📚' },
  software: { label: 'Software', icon: '💻' },
  taxes: { label: 'Impostos', icon: '🏛️' },
  other_expense: { label: 'Outra Despesa', icon: '💸' },
} as const;

// Payment methods
export const PAYMENT_METHODS = {
  cash: { label: 'Dinheiro', icon: '💵' },
  pix: { label: 'Pix', icon: '⚡' },
  credit_card: { label: 'Cartão de Crédito', icon: '💳' },
  debit_card: { label: 'Cartão de Débito', icon: '💳' },
  bank_transfer: { label: 'Transferência', icon: '🏦' },
  other: { label: 'Outro', icon: '📝' },
} as const;

// Emotions for diary
export const EMOTIONS = {
  happy: { label: 'Feliz', emoji: '😊', color: '#fbbf24' },
  sad: { label: 'Triste', emoji: '😢', color: '#60a5fa' },
  anxious: { label: 'Ansioso(a)', emoji: '😰', color: '#f97316' },
  angry: { label: 'Com Raiva', emoji: '😡', color: '#ef4444' },
  fearful: { label: 'Com Medo', emoji: '😨', color: '#a78bfa' },
  surprised: { label: 'Surpreso(a)', emoji: '😲', color: '#34d399' },
  disgusted: { label: 'Enojado(a)', emoji: '🤢', color: '#84cc16' },
  calm: { label: 'Calmo(a)', emoji: '😌', color: '#86b5a0' },
  confused: { label: 'Confuso(a)', emoji: '😕', color: '#f59e0b' },
  hopeful: { label: 'Esperançoso(a)', emoji: '🤗', color: '#10b981' },
  grateful: { label: 'Grato(a)', emoji: '🙏', color: '#ec4899' },
  lonely: { label: 'Solitário(a)', emoji: '😔', color: '#6366f1' },
  frustrated: { label: 'Frustrado(a)', emoji: '😤', color: '#dc2626' },
  overwhelmed: { label: 'Sobrecarregado(a)', emoji: '😩', color: '#7c3aed' },
  content: { label: 'Contente', emoji: '🥰', color: '#f9a8d4' },
  other: { label: 'Outro', emoji: '💭', color: '#9ca3af' },
} as const;

// Navigation items
export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início', icon: 'LayoutDashboard' },
  { href: '/dashboard/patients', label: 'Pacientes', icon: 'Users' },
  { href: '/dashboard/schedule', label: 'Agenda', icon: 'CalendarDays' },
  { href: '/dashboard/finances', label: 'Financeiro', icon: 'Wallet' },
  { href: '/dashboard/settings', label: 'Config.', icon: 'Settings' },
] as const;

// Greeting based on time of day
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Format currency (BRL)
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// Format date
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    ...options,
  }).format(new Date(date));
}

// Format time
export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
