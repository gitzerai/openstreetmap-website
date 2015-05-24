require 'rubygems'
require 'json'
require 'algoliasearch'

namespace :algolia  do
  desc "populates algolia index with data"
  task :populate do
    app_id = ENV['ALGOLIA_APP_ID']
    api_key = ENV['ALGOLIA_API_KEY']
    index_name = ENV['INDEX_NAME']
    file_path = ENV['FILE_PATH']

    Algolia.init :application_id => app_id,
                 :api_key        => api_key

    def transform(record)
      languages = Array.new

      name = ''
      tags = record['tags']
      if tags.has_key?('name')
        name = tags['name'];
        tags.delete('name')
      end
      record['name'] = name

      record['_geoloc'] = {
        'lat' => record['lat'],
        'lng' => record['lon']
      }

      record.delete('lat')
      record.delete('lon')

      tags.keys.each do |tag_key|
        if tag_key.starts_with?('name:')
          lang_name = record['tags'][tag_key]

          if lang_name != name
            record[tag_key] = lang_name
            languages.push(tag_key.split(':').last)
          end

          tags.delete(tag_key)
        end
      end

      tags.delete('place')
      return record, languages
    end

    def load_data(file_path)
      records = Array.new
      languages = Array.new

      file = File.read(file_path)
      data = JSON.parse(file)

      data["elements"].each do |record|
        record, rec_languages = transform(record)
        languages = languages + rec_languages
        records.push(record)
      end

      languages = languages.uniq
      puts "Languages: " + languages.join(', ')
      return records, languages
    end

    master_index = Algolia::Index.new(index_name)

    data, languages = load_data(file_path)

    slave_index_names = Array.new

    puts "Amount of records: " + data.count.to_s
    record_counter = 0

    languages.each do |language|
      slave_index_name = index_name + '_' + language
      slave_index_names.push(slave_index_name)
      slave_index = Algolia::Index.new(slave_index_name)
      slave_index.set_settings({
        :attributesToIndex => ['name', '_geoloc', 'name_' + language],
      })
      puts "Slave: " + slave_index_name
    end

    master_index.set_settings({
      :attributesToIndex => ['name', '_geoloc'],
      :slaves            => slave_index_names
    })

    total_records = data.count.to_s


      #load_data(file_path).each_slice(10) do |batch|
      #    puts "Batch no." + batchCounter.to_s
      #    index.add_objects(batch)
      #    batchCounter = batchCounter + 1
      #  end

    data.each do |record|
      str = "Record " + record_counter.to_s + " of " + total_records
      if record.has_key?("name")
        str = str + ": " + record["name"]
      end
      puts str
      master_index.add_object(record)
      record_counter = record_counter + 1
    end

    print api_key
  end
end
