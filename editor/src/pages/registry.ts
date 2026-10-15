import type { ComponentType } from 'react';
import type { PageId } from '../state/validation';

export interface PageDef {
  id: PageId;
  title: string;
  component: ComponentType;
}

export const pages: PageDef[] = [];

const ORDER: PageId[] = ['avatar', 'monster', 'map', 'rooms'];

export function registerPage(page: PageDef): void {
  pages.push(page);
  pages.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
