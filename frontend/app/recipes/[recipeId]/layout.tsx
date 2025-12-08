// Enable dynamic rendering for SSR
export const dynamic = 'force-dynamic';

export default function RecipeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
