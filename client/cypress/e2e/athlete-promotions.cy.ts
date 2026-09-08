import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Belt + stripe promotion history — the read timeline (post-v2.9.0) plus
 * correcting `recorded_at` on an existing row (#1431 PR 1 of 2). Every call
 * is intercepted, so what this proves is the client wiring: the pencil opens
 * a dialog seeded with the row's own date, confirming PATCHes and reloads
 * the timeline, cancelling touches nothing, and a failed PATCH surfaces an
 * error instead of silently losing the edit.
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

const ATHLETE = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2025-01-10',
  created_at: '2025-01-10T10:00:00+00:00',
  is_self: false,
};

function promotion(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 1,
    to_stripes: 2,
    belt_at_event: 'blue',
    recorded_at: '2026-09-01T10:00:00+00:00',
    recorded_by: { id: 1, full_name: 'Owner User' },
    ...over,
  };
}

function promotionsPage(rows: unknown[]) {
  return {
    statusCode: 200,
    body: {
      data: rows,
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        path: '',
        per_page: 20,
        to: rows.length,
        total: rows.length,
      },
    },
  };
}

describe('Athlete promotion history (#1431 PR 1 of 2)', () => {
  beforeEach(() => {
    // Catch-all FIRST — see docs/development/visual-verification.md and the
    // repo gotchas: any dashboard-shell call left unmocked reaches the live
    // local backend and the fake `visitAuthenticated` token gets a genuine
    // 401, which logs the session out mid-test.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } }).as(
      'athlete',
    );
  });

  it('renders the timeline and opens the edit dialog seeded with the row date', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-9"]').should('be.visible').and('contain.text', 'stripes');
    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-dialog"]').should('be.visible');
    // Seeded from the row's own date — confirming with no further input is
    // exactly the "just fix the year" case the issue describes.
    cy.get('[data-cy="promotion-edit-date"] input').should('have.value', '01/09/2026');
  });

  it('confirms, PATCHes the date, and reloads the timeline', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', {
      statusCode: 200,
      body: { data: promotion({ recorded_at: '2026-03-15T00:00:00+00:00' }) },
    }).as('patch');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.intercept(
      'GET',
      '/api/v1/athletes/1/promotions*',
      promotionsPage([promotion({ recorded_at: '2026-03-15T00:00:00+00:00' })]),
    ).as('reload');

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-confirm"]').click();

    cy.wait('@patch')
      .its('request.body.recorded_at')
      .should('match', /^\d{4}-\d{2}-\d{2}$/);
    cy.wait('@reload');
    // The `<p-dialog>` host stays in the DOM; only the overlay mask
    // mounts/unmounts (see athlete-documents.cy.ts) — a reliable signal
    // for "dialog is closed" that `not.be.visible` on the host isn't.
    cy.get('.p-dialog-mask').should('not.exist');
  });

  it('cancel closes the dialog and never calls the server', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', {
      statusCode: 200,
      body: { data: promotion() },
    }).as('patch');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-cancel"]').click();
    // The `<p-dialog>` host stays in the DOM; only the overlay mask
    // mounts/unmounts (see athlete-documents.cy.ts) — a reliable signal
    // for "dialog is closed" that `not.be.visible` on the host isn't.
    cy.get('.p-dialog-mask').should('not.exist');
    cy.get('@patch.all').should('have.length', 0);
  });

  it('surfaces an error toast when the correction fails, without losing the row', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', { statusCode: 422 }).as('patchFails');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-confirm"]').click();
    cy.wait('@patchFails');

    cy.contains(/couldn.t update the date/i).should('be.visible');
    // The row is unchanged — a failed correction is not a silent data loss.
    cy.get('[data-cy="promotion-9"]').should('be.visible');
  });
});
