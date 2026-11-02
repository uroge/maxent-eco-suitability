import { Alert, Button } from '@ecosuitability/ui';
import { ApiClientError } from '@/lib/api-error';

type QueryStateAlertProps = {
  title: string;
  message?: string;
  error?: unknown;
  onRetry: () => void;
};

export const QueryStateAlert: React.FC<QueryStateAlertProps> = ({
  error,
  message,
  onRetry,
  title,
}) => (
  <Alert variant="destructive">
    <p className="font-semibold">{title}</p>
    <p className="mt-1">
      {message ??
        (error instanceof ApiClientError
          ? `${error.message} (${error.code})`
          : 'The service could not complete this request.')}
    </p>
    <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>
      Retry
    </Button>
  </Alert>
);
