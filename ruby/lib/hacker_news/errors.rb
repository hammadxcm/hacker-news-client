# frozen_string_literal: true

module HackerNews
  # Base error class. Every exception the client raises is a subclass of this.
  #
  # @!attribute [r] url
  #   @return [String, nil] the URL being fetched when the error occurred.
  # @!attribute [r] status
  #   @return [Integer, nil] the HTTP status code, when applicable.
  class Error < StandardError
    attr_reader :url, :status

    # @param message [String]
    # @param url [String, nil]
    # @param status [Integer, nil]
    def initialize(message, url: nil, status: nil)
      super(message)
      @url = url
      @status = status
    end
  end

  # Raised when a request exceeds the client's total timeout budget.
  class TimeoutError < Error; end

  # Raised on a non-2xx HTTP response. +status+ is always set.
  class HttpError < Error; end

  # Raised when the response body cannot be decoded as JSON.
  class JsonError < Error; end

  # Raised on DNS / TLS / connection failures.
  class TransportError < Error; end
end
