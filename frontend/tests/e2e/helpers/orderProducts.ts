import type { Page } from "@playwright/test";
export const productRow = (page: Page, id: string) => page.locator(`.product-checklist tr[data-product-id="${id}"]`);
export const productQuantity = (page: Page, id: string) => productRow(page,id).getByRole("spinbutton");
export const selectProduct = (page: Page, id: string) => productRow(page,id).getByRole("checkbox").check();
export async function collectOrder(page: Page) {
  await page.getByRole("button",{ name:"Collect order & settle payment",exact:true }).click();
  const dialog = page.getByRole("dialog");
  const settle = dialog.getByRole("button",{ name:"Receive balance & collect",exact:true });
  if (await settle.count()) await settle.click();
  else await dialog.getByRole("button",{ name:"Confirm collected",exact:true }).click();
}
