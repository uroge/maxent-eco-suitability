'use client';

type ApiFetchOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit };

type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

const isAuthenticationFailure = (response: Response): boolean => response.status === 401;

export const createApiClient = (getToken: GetToken) => {
  const request = async (path: string, options: ApiFetchOptions = {}): Promise<Response> => {
    const send = async (skipCache: boolean): Promise<Response> => {
      const token = await getToken({ skipCache });
      const headers = new Headers(options.headers);

      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return fetch(new URL(path, process.env.NEXT_PUBLIC_API_URL).toString(), {
        ...options,
        headers,
      });
    };

    const response = await send(false);
    return isAuthenticationFailure(response) ? send(true) : response;
  };

  return { request };
};
