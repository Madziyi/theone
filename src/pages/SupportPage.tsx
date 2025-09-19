import { Link } from 'react-router-dom';
import { Mail, Phone, HelpCircle, MessageSquare, FileText } from 'lucide-react';

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Support & Help</h1>
        <p className="text-gray-600">
          Get help with RIPPLE or contact our support team
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Contact Information */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Contact Us
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Email Support</p>
                  <a 
                    href="mailto:telab@uwindsor.ca" 
                    className="text-primary hover:underline"
                  >
                    telab@uwindsor.ca
                  </a>
                  <p className="text-sm text-gray-600 mt-1">
                    For technical issues, account questions, or general inquiries
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Phone Support</p>
                  <a 
                    href="tel:+12265067410" 
                    className="text-primary hover:underline"
                  >
                    +1 (226) 506-7410
                  </a>
                  <p className="text-sm text-gray-600 mt-1">
                    Available during business hours (EST)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Documentation
            </h2>
            <div className="space-y-3">
              <Link 
                to="/privacy" 
                className="flex items-center gap-2 text-primary hover:underline"
              >
                Privacy Policy
              </Link>
              <p className="text-sm text-gray-600">
                Learn about how we handle your data and protect your privacy
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">How do I view water monitoring data?</h3>
                <p className="text-sm text-gray-600">
                  Navigate to the Map page to see real-time water monitoring data from buoys in your area. You can also use the Trends page to view historical data.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-900 mb-2">How do alerts work?</h3>
                <p className="text-sm text-gray-600">
                  RIPPLE sends alerts when water conditions meet certain criteria. You can manage your alert preferences in the Alerts section of your dashboard.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Can I download data?</h3>
                <p className="text-sm text-gray-600">
                  Yes! Use the Download Center in your dashboard to export water monitoring data in various formats.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Is my location tracked?</h3>
                <p className="text-sm text-gray-600">
                  No, RIPPLE does not track or store your location. We only use your device's local time to determine when to send relevant alerts.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-blue-900 mb-2">Need immediate assistance?</h3>
            <p className="text-blue-800 text-sm mb-3">
              For urgent technical issues or critical water quality concerns, please contact us directly.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a 
                href="mailto:telab@uwindsor.ca" 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </a>
              <a 
                href="tel:+12265067410" 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 text-sm"
              >
                <Phone className="h-4 w-4" />
                Call Now
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">About RIPPLE</h2>
        <p className="text-gray-700 mb-4">
          RIPPLE is a water monitoring application that provides real-time data and alerts for water quality conditions. 
          Our mission is to help communities stay informed about their local water environments.
        </p>
        <p className="text-sm text-gray-600">
          Developed by T & E Lab
        </p>
      </div>
    </div>
  );
}

