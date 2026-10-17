import { ContentPage } from '@/components/ContentPage';

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Draft · owner review required"
      title="Privacy"
      intro="This factual draft describes the implemented service and must be reviewed by the product owner and legal counsel before production use."
    >
      <section>
        <h2 className="text-xl font-semibold">Authentication and ownership</h2>
        <p className="mt-2">
          Clerk authenticates users. The API associates each analysis with the authenticated Clerk
          user ID and does not reveal whether an unavailable analysis is missing, expired, or owned
          by someone else.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Temporary data</h2>
        <p className="mt-2">
          Uploaded inputs, lifecycle state, map assets, logs, and results are stored temporarily for
          up to 48 hours. Cancellation and expiry schedule associated objects for deletion. The
          application does not add a permanent analysis-history database.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Browser-visible data</h2>
        <p className="mt-2">
          Only variables prefixed with NEXT_PUBLIC are exposed to browser code. Storage credentials,
          internal service secrets, and storage object keys remain server-side.
        </p>
      </section>
    </ContentPage>
  );
}
