/**
 * /restricted — Dead end for users from restricted jurisdictions.
 *
 * Displays the standard Regulation S securities legend.
 * No way to proceed — user must close the tab.
 */
export default function RestrictedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="https://kayanforest.com/wp-content/uploads/2025/06/kayan-new-logo.png"
            alt="Kayan Forest"
            className="h-10 w-auto opacity-40"
          />
        </div>

        {/* Restricted Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {/* Icon */}
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-4">
            Access Restricted
          </h1>

          {/* Standard Reg S Legend */}
          <div className="text-sm text-gray-600 leading-relaxed space-y-4 text-left">
            <p className="font-semibold text-gray-800">
              IMPORTANT NOTICE
            </p>

            <p>
              The securities referenced on this portal have not been and will not
              be registered under the United States Securities Act of 1933, as
              amended (the &ldquo;Securities Act&rdquo;), or under the securities
              laws of any state or other jurisdiction of the United States. Such
              securities may not be offered, sold, pledged, or otherwise
              transferred within the United States or to, or for the account or
              benefit of, U.S. Persons (as defined in Regulation S under the
              Securities Act), except pursuant to an exemption from, or in a
              transaction not subject to, the registration requirements of the
              Securities Act and applicable state securities laws.
            </p>

            <p>
              This portal and the information contained herein do not constitute
              and shall not be construed as an offer to sell or the solicitation
              of an offer to buy securities in any jurisdiction in which such
              offer or solicitation would be unlawful.
            </p>

            <p>
              Access to information concerning this token offering is restricted
              to persons who are not U.S. Persons and who are not located in a
              jurisdiction subject to comprehensive sanctions by the United
              States Office of Foreign Assets Control (OFAC), including but not
              limited to Cuba, Iran, North Korea, Syria, Russia, Belarus,
              Myanmar, and Venezuela.
            </p>
          </div>

          {/* Exit link */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <a
              href="https://www.kayanforest.com"
              className="text-sm text-kayan-500 hover:text-kayan-600 font-medium"
            >
              Return to kayanforest.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
