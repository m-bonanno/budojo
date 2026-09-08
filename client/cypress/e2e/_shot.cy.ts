/**
 * The visual-verification harness (#1460), driven by `make shot`.
 *
 * Every UI change is supposed to get a real-browser look before it is pushed
 * — `docs/development/visual-verification.md` has said so for a long time —
 * but the recipe was "write a throwaway spec", which meant inventing fixtures
 * and remembering to delete it afterwards. Half the time the throwaway spec
 * was the bug: a stale one shipped `<<<<<<< HEAD` to four mobile cards with
 * both gates green.
 *
 * So this one is permanent, takes the route from the environment, and shoots
 * the two widths the canon cares about. It runs against whatever the dev
 * backend is serving, which is the point: real data, real empty states.
 *
 *   make shot PAGE=/dashboard/athletes
 */
const route = Cypress.env('PAGE') ?? '/dashboard/athletes';
const slug =
  String(route)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'page';

describe(`shot ${route}`, () => {
  it('desktop 1280', () => {
    cy.viewport(1280, 800);
    cy.visitAuthenticated(route);
    // Give the page its data before the shutter — a screenshot of a skeleton
    // is a screenshot of nothing.
    cy.get('body').should('be.visible');
    cy.wait(1200);
    cy.screenshot(`${slug}-1280`, { overwrite: true, capture: 'viewport' });
  });

  it('mobile 375', () => {
    cy.viewport(375, 800);
    cy.visitAuthenticated(route);
    cy.get('body').should('be.visible');
    cy.wait(1200);
    cy.screenshot(`${slug}-375`, { overwrite: true, capture: 'viewport' });
  });
});
