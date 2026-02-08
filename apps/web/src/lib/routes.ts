import type { Route } from 'next';

export const route = <T extends string>(value: T) => value as Route;
