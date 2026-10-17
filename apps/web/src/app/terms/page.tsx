import { ContentPage } from '@/components/ContentPage';

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Draft · owner review required"
      title="Terms of use"
      intro="This concise draft reflects actual application behavior and requires owner and legal review before production use."
    >
      <section>
        <h2 className="text-xl font-semibold">Acceptable use</h2>
        <p className="mt-2">
          Use the service only with data you are authorized to process. Do not upload secrets,
          malicious archives, unlawful content, or data whose temporary processing is prohibited.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Scientific responsibility</h2>
        <p className="mt-2">
          Outputs are reproducible modelling aids, not guarantees of species presence, regulatory
          conclusions, or professional ecological advice. You are responsible for study design, data
          quality, interpretation, and downstream decisions.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Availability and deletion</h2>
        <p className="mt-2">
          Analyses and downloads are temporary and may expire after 48 hours. Cancellation is final.
          Service limits, dependency failures, and retention cleanup may make data unavailable, so
          retain source data and download required outputs promptly.
        </p>
      </section>
    </ContentPage>
  );
}
