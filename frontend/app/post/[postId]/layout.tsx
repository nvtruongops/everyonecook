// Enable dynamic rendering for SSR
export const dynamic = 'force-dynamic';

export default function PostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
