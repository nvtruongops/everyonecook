// Enable dynamic rendering for SSR
export const dynamic = 'force-dynamic';

export default function ManageRecipeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
