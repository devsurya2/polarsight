export interface PageParams {
  page: number;
  perPage: number;
}

export const skipTake = ({ page, perPage }: PageParams) => ({
  skip: (page - 1) * perPage,
  take: perPage,
});

export function paginated<T>(items: T[], total: number, { page, perPage }: PageParams) {
  return {
    items,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      hasNext: page * perPage < total,
      hasPrev: page > 1,
    },
  };
}
