// Server component to satisfy static export requirements
export async function generateStaticParams() {
  return []; // Client-side routing only
}

// Disable pre-rendering for dynamic routes
export const dynamicParams = false;
export const dynamic = 'error';

export default function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
