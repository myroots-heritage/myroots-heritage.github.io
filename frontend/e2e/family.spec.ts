import { test, expect } from '@playwright/test';
test('family questionnaire, phone privacy display, profile sharing, chat and event flow',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Every branch, a belonging.'})).toBeVisible();
  await expect(page.locator('.tree-node')).toHaveCount(9);
  await page.getByRole('button',{name:'Add family member',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Full name').fill('Nisha Sharma');
  await dialog.locator('input[name="phone"]').fill('+919876543210');await dialog.locator('input[name="city"]').fill('Jaipur');
  await dialog.getByRole('button',{name:'Add to our family'}).click();
  await expect(dialog).not.toBeVisible();await expect(page.locator('.tree-node')).toHaveCount(10);
  await page.locator('.tree-node').filter({hasText:'Nisha Sharma'}).click();
  await expect(page.locator('.member-detail')).toContainText('+919876543210');await expect(page.locator('.member-detail')).toContainText('Not yet verified');
  await page.getByRole('button',{name:'Privacy & access',exact:true}).click();
  await page.getByRole('combobox',{name:'Who can see Current city'}).selectOption('branch');
  await page.getByLabel('Branch head').selectOption({label:'Vikram Sharma'});
  await expect(page.locator('.branch-people .included')).toHaveCount(4);
  await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByRole('status')).toContainText('privacy preferences');
  await page.getByRole('button',{name:'Family circle',exact:true}).click();
  await page.getByRole('textbox',{name:'Message to your family'}).fill('Looking forward to seeing everyone!');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.chat-message').last()).toContainText('Looking forward to seeing everyone!');
  await page.getByRole('button',{name:'Gatherings',exact:true}).click();await page.getByRole('button',{name:'Plan a gathering',exact:true}).click();
  await dialog.getByLabel('What’s the occasion?').fill('Family lunch');await dialog.getByLabel('When?').fill('2027-05-01T12:30');await dialog.getByLabel('Where?').fill('Grandma’s house');await dialog.getByRole('button',{name:'Create gathering'}).click();
  await expect(page.locator('.event-card')).toContainText('Family lunch');await page.locator('.event-card').getByRole('button',{name:'Share gathering'}).click();
  await expect(dialog.locator('.invite-preview')).toContainText('Family lunch');await dialog.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Entry workflows',exact:true}).click();await expect(page.locator('.flow-row')).toHaveCount(4);
  expect(errors).toEqual([]);
});
test('mobile layout and navigation remain usable without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('.tree-node')).toHaveCount(9);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'My profile',exact:true}).click();
  await expect(page.getByRole('heading',{name:'The story starts with you.'})).toBeVisible();
  await page.getByLabel('Current city',{exact:true}).fill('Test City');await page.getByRole('button',{name:'Save my details'}).click();await expect(page.getByRole('status')).toContainText('personal details');
  await page.screenshot({path:'/private/tmp/myroots-mobile.png',fullPage:true});
});
test('desktop tree screenshot',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');await expect(page.locator('.tree-node')).toHaveCount(9);await page.screenshot({path:'/private/tmp/myroots-desktop.png',fullPage:true});
});
