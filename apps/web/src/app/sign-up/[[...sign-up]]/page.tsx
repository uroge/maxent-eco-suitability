import { SignUp } from '@clerk/nextjs';
import { clerkAppearance } from '@/clerk-appearance';
import { AuthShell } from '@/components/AuthShell';

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={clerkAppearance} path="/sign-up" routing="path" signInUrl="/sign-in" />
    </AuthShell>
  );
}
