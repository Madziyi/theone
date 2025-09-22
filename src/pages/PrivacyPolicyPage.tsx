import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy for RIPPLE App</h1>
        <p className="text-muted-foreground">
          <em>Effective Date: 18/9/2025</em>
        </p>
      </div>

      <div className="max-w-none">
        <p className="text-lg mb-6">
          RIPPLE ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application (the "App"), which displays water monitoring data and sends alerts for potentially concerning water conditions.
        </p>

        <p className="mb-8">
          By using the RIPPLE App, you agree to the collection and use of information in accordance with this Privacy Policy.
        </p>

        <hr className="my-8" />

        <h2 className="text-2xl font-semibold text-foreground mb-4">1. Information We Collect</h2>

        <h3 className="text-xl font-medium text-foreground mb-3">a. Personal Information</h3>
        <p className="mb-4">We may collect limited personal information, such as:</p>
        <ul className="list-disc pl-6 mb-6">
          <li><strong>Email address</strong> (used for sending alerts or managing your account)</li>
        </ul>

        <h3 className="text-xl font-medium text-foreground mb-3">b. Device and Usage Data</h3>
        <p className="mb-4">When you use the App, we may automatically collect:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Device type and operating system</li>
          <li>App usage data (e.g., screen views, clicks, crash logs)</li>
          <li>Local time (from your device clock) to determine when to send alerts</li>
        </ul>

        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Important:</p>
          <p className="text-blue-800 dark:text-blue-200">
            We <strong>do not collect, store, or track your device's location</strong>. We use your device's local time solely to determine when to deliver alerts relevant to your region's water monitoring data.
          </p>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mb-4">2. How We Use Your Information</h2>
        <p className="mb-4">We use your information to:</p>
        <ul className="list-disc pl-6 mb-6">
          <li>Display water quality and monitoring data</li>
          <li>Send alerts and notifications based on timing conditions (e.g., alerts that occur during local daylight or hazardous periods)</li>
          <li>Improve the performance and usability of the App</li>
          <li>Analyze usage patterns to make technical improvements</li>
        </ul>

        <h2 className="text-2xl font-semibold text-foreground mb-4">3. Sharing of Information</h2>
        <p className="mb-4">
          We do <strong>not sell</strong>, rent, or trade your personal data. Your information may be shared only:
        </p>
        <ul className="list-disc pl-6 mb-6">
          <li>With trusted third-party service providers who assist in App hosting or email delivery</li>
          <li>When required by law, regulation, or legal process</li>
          <li>To protect the security and integrity of the App</li>
          <li>With your explicit consent</li>
        </ul>

        <h2 className="text-2xl font-semibold text-foreground mb-4">4. Data Retention</h2>
        <p className="mb-6">
          We retain your information only as long as needed to provide services or comply with legal obligations. You may request that we delete your personal data at any time.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">5. Security of Your Information</h2>
        <p className="mb-6">
          We implement reasonable technical and organizational measures to protect your personal information from unauthorized access, disclosure, or misuse. However, no method of transmission over the internet or electronic storage is entirely secure.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">6. Your Rights and Choices</h2>
        <p className="mb-4">Depending on your location, you may have rights to:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Access or correct your personal data</li>
          <li>Request deletion of your data</li>
          <li>Opt out of receiving alerts or emails</li>
        </ul>
        <p className="mb-6">
          To exercise any of these rights, please contact us at <a href="mailto:telab@uwindsor.ca" className="text-primary hover:underline">telab@uwindsor.ca</a>.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">7. Children's Privacy</h2>
        <p className="mb-6">
          The RIPPLE App is not intended for children under 13 (or the equivalent age in your jurisdiction). We do not knowingly collect personal information from children without verifiable parental consent.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">8. Third-Party Services</h2>
        <p className="mb-6">
          The App may contain links or integrations to third-party services (e.g., analytics providers). We are not responsible for their privacy practices and encourage you to review their policies before interacting with those services.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">9. Changes to This Policy</h2>
        <p className="mb-6">
          We may update this Privacy Policy occasionally. Changes will be posted within the App and the effective date will be updated accordingly. You are advised to review this policy periodically.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mb-4">10. Contact Us</h2>
        <p className="mb-4">
          If you have any questions or concerns about this Privacy Policy, please contact us:
        </p>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="font-semibold text-foreground mb-2">RIPPLE</p>
          <p className="text-muted-foreground">
            <strong>Email:</strong> <a href="mailto:telab@uwindsor.ca" className="text-primary hover:underline">telab@uwindsor.ca</a>
          </p>
        </div>
      </div>
    </div>
  );
}

