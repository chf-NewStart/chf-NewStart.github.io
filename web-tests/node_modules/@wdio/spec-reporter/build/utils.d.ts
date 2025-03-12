interface Row {
    cells: string[];
}
/**
 * transform cucumber table to format suitable for `easy-table`
 * @param   {object[]} rows cucumber table rows
 * @returns {object[]}
 */
export declare const buildTableData: (rows: Row[]) => Record<number, string>[];
/**
 * returns table in string format
 * @param   {object[]} data table data
 * @returns {string}
 */
export declare const printTable: (data: unknown) => string;
/**
 * add indentation
 * @param {string} table printed table
 * @param {string} testIndent whitespaces
 */
export declare const getFormattedRows: (table: string, testIndent: string) => string[];
/**
 * Get Sauce Labs Authentication url
 * @param {string} user
 * @param {string} key
 * @param {string} sessionId
 */
export declare const sauceAuthenticationToken: (user: string, key: string, sessionId: string) => string;
export {};
//# sourceMappingURL=utils.d.ts.map