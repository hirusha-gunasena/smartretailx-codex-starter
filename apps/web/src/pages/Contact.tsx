import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';

export const Contact: React.FC = () => {
  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">Contact Us</h1>
          <p className="text-gray-500 max-w-2xl mx-auto">
            We're here to help. Reach out to our customer support team for any inquiries, technical
            assistance, or feedback.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {/* Contact Form */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-8">
              Send Us a Message
            </h2>
            <form className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-gray-900 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  className="w-full px-4 py-3 border border-gray-200 focus:ring-1 focus:ring-black focus:border-black outline-none transition-all text-sm"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  className="w-full px-4 py-3 border border-gray-200 focus:ring-1 focus:ring-black focus:border-black outline-none transition-all text-sm"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-gray-900 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-200 focus:ring-1 focus:ring-black focus:border-black outline-none transition-all resize-none text-sm"
                  placeholder="How can we help you?"
                ></textarea>
              </div>
              <button
                type="button"
                className="w-full bg-black text-white py-3 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>

          {/* Contact Info */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-8">
              Contact Information
            </h2>
            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <MapPin className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">Headquarters</h4>
                  <p className="text-gray-500 text-sm mt-1">
                    123 Tech Avenue, Silicon Valley
                    <br />
                    CA 94025, United States
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">Email Us</h4>
                  <p className="text-gray-500 text-sm mt-1">
                    support@smartretailx.com
                    <br />
                    sales@smartretailx.com
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Phone className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">Call Us</h4>
                  <p className="text-gray-500 text-sm mt-1">
                    +1 (555) 123-4567
                    <br />
                    Mon-Fri, 9am - 6pm PST
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
