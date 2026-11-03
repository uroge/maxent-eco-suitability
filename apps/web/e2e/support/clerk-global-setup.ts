import { clerkSetup } from '@clerk/testing/playwright';

const globalSetup = async (): Promise<void> => {
  await clerkSetup();
};

export default globalSetup;
