import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth-crypto';

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  const user = await verifySession(sessionToken);

  if (!user) {
    redirect('/login');
  } else if (user.role === 'admin') {
    redirect('/admin');
  } else if (user.role === 'seller') {
    redirect('/seller');
  } else {
    redirect('/user');
  }
}
