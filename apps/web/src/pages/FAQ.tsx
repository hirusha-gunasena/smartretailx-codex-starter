import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const faqs = [
  {
    question: "What is your return policy?",
    answer: "We offer a 30-day money-back guarantee on all products. If you are not completely satisfied with your purchase, simply return it in its original packaging for a full refund."
  },
  {
    question: "How long does shipping take?",
    answer: "Standard shipping takes 3-5 business days. We also offer expedited shipping (1-2 business days) at checkout. Orders placed before 2 PM PST are processed the same day."
  },
  {
    question: "Do you ship internationally?",
    answer: "Currently, we only ship within the United States and Canada. We are working hard to expand our logistics network to support global shipping in the near future."
  },
  {
    question: "Are my payment details secure?",
    answer: "Absolutely. We use industry-standard AES-256 encryption and partner with certified, compliant payment gateways. We never store your raw credit card information on our servers."
  },
  {
    question: "How do I track my order?",
    answer: "Once your order has shipped, you will receive an email with a tracking number. You can also view the real-time status of your shipments in the 'My Orders' section of your account."
  }
];

export const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Find answers to common questions about our products, shipping, and policies.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full py-6 flex items-center justify-between focus:outline-none group"
                >
                  <span className="font-semibold text-sm text-gray-900 text-left group-hover:text-gray-600 transition-colors">
                    {faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 ml-4" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-4" strokeWidth={1.5} />
                  )}
                </button>
                {isOpen && (
                  <div className="pb-6 text-sm text-gray-500 leading-relaxed">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-16 text-center bg-gray-50 border border-gray-200 p-12">
          <h3 className="font-bold text-gray-900 mb-2">Still have questions?</h3>
          <p className="text-gray-500 text-sm mb-6">
            We're always here to help. Reach out to our support team.
          </p>
          <Link
            to="/contact"
            className="inline-block bg-black text-white px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
};
