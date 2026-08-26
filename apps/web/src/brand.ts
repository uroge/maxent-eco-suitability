const clientBrandPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const resolveClientBrand = (value: string | undefined): string | undefined => {
  const brand = value?.trim().toLowerCase();

  return brand && clientBrandPattern.test(brand) ? brand : undefined;
};

export const getConfiguredBrand = (): string | undefined =>
  resolveClientBrand(process.env.CLIENT_BRAND);
