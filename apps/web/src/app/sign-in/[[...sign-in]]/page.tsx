import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/clerk-appearance';
import { AuthShell } from '@/components/AuthShell';

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn appearance={clerkAppearance} path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </AuthShell>
  );
}
