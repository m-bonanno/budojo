import { MOCK_ACADEMY } from '../support/fixtures';

// Desktop (>=768px) social rail for the athlete shell (#1110). The mobile
// bottom-nav is covered structurally in the component spec; this asserts the
// rail renders + behaves in a real browser at a desktop viewport.

const ATHLETE_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      first_name: 'Marco',
      last_name: 'Rossi',
      full_name: 'Marco Rossi',
      handle: 'marcobjj',
      email: 'marco@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
      role: 'athlete',
    },
  },
};

describe('Athlete desktop social rail (#1110)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
    // Catch-all first so no unmocked background poll re-renders the shell
    // mid-interaction; specific overrides win. Empty *paginated* envelope —
    // the feed page reads `meta.current_page`, so a bare `{ data: [] }` makes
    // it throw on resolve.
    cy.intercept('GET', '/api/v1/**', {
      statusCode: 200,
      body: {
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      },
    });
    cy.intercept('GET', '/api/v1/academy*', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/auth/me*', ATHLETE_ME);
  });

  it('renders the destinations, with no Create button (#1462)', () => {
    cy.visitAuthenticated('/dashboard/me/feed');
    cy.get('[data-cy="athlete-rail"]').should('be.visible');
    cy.get('[data-cy="athlete-rail"] a[href="/dashboard/me/feed"]').should('be.visible');
    cy.get('[data-cy="athlete-rail"] a[href="/dashboard/me/academy"]').should('be.visible');
    cy.get('[data-cy="athlete-rail"] a[href="/dashboard/me/attendance"]').should('be.visible');
    cy.get('[data-cy="athlete-rail"] a[href="/dashboard/me/more"]').should('be.visible');
    // Went with the owner's (#1462): they share the component, and the
    // argument — everything behind it is reachable from its own section —
    // is the same on both shells.
    cy.get('[data-cy="rail-create"]').should('not.exist');
  });

  it('still opens the create sheet from the phone bar (#1462)', () => {
    // The rail lost the button; the bottom bar keeps it, because a bar has
    // no sections to reach the same things from.
    cy.visitAuthenticated('/dashboard/me/feed');
    cy.get('[role="dialog"]').should('not.exist');

    cy.get('[data-cy="bottomnav-create"]').click({ force: true });
    cy.get('[role="dialog"]').should('exist');

    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('pins a profile chip that links to the More hub', () => {
    cy.visitAuthenticated('/dashboard/me/feed');
    cy.get('[data-cy="rail-profile"]')
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard/me/more');
  });
});
