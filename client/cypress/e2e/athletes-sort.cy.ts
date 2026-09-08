import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_IPHONE_SE } from '../support/viewports';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const EMPTY_PAGE = {
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
};

const ONE_BROWN_BELT = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        phone_country_code: '+39',
        phone_national_number: '3331234567',
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'brown',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        created_at: '2026-04-22T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
  },
};

describe('athletes table — column sorting', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance/summary*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', { statusCode: 200, body: EMPTY_PAGE }).as('athletes');
  });

  it('sends sort_by + sort_order on the wire from the toolbar belt control', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // Belt sorting left the table header in #1443 — the header did not exist
    // on a phone, so this was desktop-only while it was a column. Ascending
    // first, the direction every table the user has muscle memory for starts
    // with (Jakob's law).
    cy.get('[data-cy="athletes-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');

    // Third press releases it. A column header could hand the sort to a
    // neighbour; a control standing on its own has to be able to let go.
    cy.get('[data-cy="athletes-sort-belt"]').click();
    cy.wait('@athletes').its('request.url').should('not.include', 'sort_by=belt');
  });

  it('the spine still says the belt in words, now that the column is gone (#1443)', () => {
    // The whole case for deleting the Belt column rests on this: on desktop
    // the spine is the row's ONLY belt, and a colour is not a name. The
    // aria-label covers a screen reader; this covers the sighted reader who
    // cannot tell brown from black in a 9px stripe. It is also the guard for
    // the `pointer-events` rule the spine carries — set that back to `none`
    // and the tooltip silently stops opening, with nothing else to notice.
    cy.intercept('GET', '/api/v1/athletes*', ONE_BROWN_BELT).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('.athlete-row__spine').first().trigger('mouseenter');
    cy.get('.p-tooltip').should('be.visible').and('contain.text', 'Brown');
  });

  it('the belt control reaches a phone, which the column header never did (#1443)', () => {
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('[data-cy="athletes-sort-belt"]').should('be.visible').click();
    cy.wait('@athletes').its('request.url').should('include', 'sort_by=belt');
  });

  it('cycles the Full name header through 4 states (#196)', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // The Full name column is a synthetic field — first_name + last_name —
    // so a single 2-state sort would leave same-first-name athletes in
    // arbitrary tiebreak order. The 4-state cycle picks both the leading
    // name and the direction; the backend tiebreaks on the OTHER name in
    // the same direction (see AthleteController::applyNameSort).
    //
    // Cycle: neutral → first asc → first desc → last asc → last desc → first asc

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=desc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=desc');

    // Loops back to the first state.
    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=asc');
  });
});
