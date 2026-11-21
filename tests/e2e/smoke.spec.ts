import {test,expect} from "@playwright/test";
test("overview leads with readiness and next steps",async({page})=>{await page.goto("/");await expect(page.getByText("Your pivot readiness")).toBeVisible();await expect(page.getByText("HIGHEST-IMPACT NEXT STEPS")).toBeVisible()});
test("skill gap map exposes requirement evidence",async({page})=>{await page.goto("/skills");await expect(page.getByText("ROLE REQUIREMENT FREQUENCY")).toBeVisible();await expect(page.getByText("Experiment design")).toBeVisible()});
test("readiness page shows component transparency",async({page})=>{await page.goto("/readiness");await expect(page.getByText("COMPONENT TRANSPARENCY")).toBeVisible();await expect(page.getByText(/^Am I ready to apply now\?/)).toBeVisible()});
